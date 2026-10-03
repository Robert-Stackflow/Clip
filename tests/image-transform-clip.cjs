const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setup } = require('./renderer-fixture.cjs');

function fixture() {
  const image = document.createElement('canvas');
  image.width = 1200;
  image.height = 350;
  const context = image.getContext('2d');
  context.fillStyle = '#de4747';
  context.fillRect(0, 0, image.width, image.height);
  window.clipperImage = {
    state: async () => ({ url: image.toDataURL(), dark: false }),
    dirty: async () => {},
    onChange: () => () => {},
  };
}

const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 }, reducedMotion: 'no-preference' });
    await context.addInitScript({ content: `(${setup.toString()})();(${fixture.toString()})();` });
    await context.route('https://clipper.test/**', async route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      await route.fulfill({
        body: await fs.readFile(path.join('dist/renderer', name)),
        contentType: name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript',
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://clipper.test/image-editor.html');
    await page.waitForFunction(() => document.querySelector('#image').width === 1200 && !document.querySelector('#rotate').disabled);

    for (const id of ['rotate', 'flip']) {
      const geometry = await page.evaluate(id => {
        document.getElementById(id).click();
        const clip = document.querySelector('.image-transform-clip');
        if (!clip) return null;
        const rect = node => {
          const box = node.getBoundingClientRect();
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        };
        return {
          clip: rect(clip),
          viewport: rect(document.querySelector('#viewport')),
          toolbar: rect(document.querySelector('.editor-commandbar')),
          tools: rect(document.querySelector('.editor-tools')),
          footer: rect(document.querySelector('.editor-footer')),
          overflow: getComputedStyle(clip).overflow,
          pointerEvents: getComputedStyle(clip).pointerEvents,
          ghostInside: clip.firstElementChild?.classList.contains('image-transform-preview'),
          surfaceHidden: document.querySelector('#surface').style.visibility === 'hidden',
        };
      }, id);
      assert(geometry, `${id} must use a preview clip while animating`);
      for (const edge of ['left', 'top', 'right', 'bottom']) {
        assert(Math.abs(geometry.clip[edge] - geometry.viewport[edge]) < 1, `${id} clip ${edge} must match the canvas viewport`);
      }
      assert.equal(geometry.overflow, 'hidden');
      assert.equal(geometry.pointerEvents, 'none');
      assert.equal(geometry.ghostInside, true);
      assert.equal(geometry.surfaceHidden, true);
      for (const region of ['toolbar', 'tools', 'footer']) {
        assert.equal(intersects(geometry.clip, geometry[region]), false, `${id} preview must not cover ${region}`);
      }
      await page.waitForFunction(() => !document.querySelector('.image-transform-clip'));
      assert.equal(await page.locator('#surface').evaluate(node => node.style.visibility), '');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', checks: ['rotation clip', 'flip clip', 'toolbar and controls unobstructed', 'animation cleanup'] }));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
