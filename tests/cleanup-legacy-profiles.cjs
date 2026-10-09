const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('legacy cleanup rejects unsafe targets and deletes only valid synthetic profiles', async t => {
  const {beginCase, repository} = await import('../scripts/workspace.mjs');
  const work = await beginCase('cleanup-script-tests');
  const engine = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  try {
    const cases = [
      {name: 'valid-preview', expected: 'Verified: 1 directories', success: true},
      {name: 'whatif-preview', expected: 'WhatIf only; no files deleted', success: true,
        args: ['-Apply', '-WhatIf']},
      {name: 'apply-fixture', expected: 'Deleted 1 verified test directories', success: true,
        args: ['-Apply'], deleted: true},
      {name: 'outside-boundary', expected: 'Manifest path, duplicate, or metadata mismatch',
        change: (entry, root) => { entry.ArchivePath = path.join(root, 'work/chat-ui/profile-ABC123'); }},
      {name: 'duplicate-entry', expected: 'Manifest path, duplicate, or metadata mismatch', duplicate: true},
      {name: 'changed-profile', expected: 'Profile changed since archival',
        change: entry => { entry.Bytes = 3; }},
      {name: 'active-marker', expected: 'Active marker found',
        setup: profile => fs.writeFile(path.join(profile, '.active'), '123')},
      {name: 'linked-contents', expected: 'Linked test contents are not allowed',
        setup: async (profile, root) => {
          const target = path.join(root, 'outside-profile');
          await fs.mkdir(target);
          await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
          await fs.symlink(target, path.join(profile, 'linked'), 'junction');
        }},
    ];
    for (const item of cases) await t.test(item.name, async () => {
      const root = path.join(work.fixtures, item.name);
      const profile = path.join(root, 'work/Clip/legacy-test-profiles/chat-ui/profile-ABC123');
      const scripts = path.join(root, 'scripts'), storage = path.join(root, 'verification/storage');
      await Promise.all([fs.mkdir(profile, {recursive: true}), fs.mkdir(scripts, {recursive: true}),
        fs.mkdir(storage, {recursive: true})]);
      const script = path.join(scripts, 'clean-legacy-test-profiles.ps1');
      await fs.copyFile(path.join(repository, 'scripts/clean-legacy-test-profiles.ps1'), script);
      // A plain fixture marker; this does not initialize a Git repository.
      await fs.writeFile(path.join(root, '.git'), 'synthetic test fixture');
      await fs.writeFile(path.join(root, 'package.json'), '{"name":"clip-desktop"}');
      await fs.writeFile(path.join(profile, 'sentinel.txt'), 'keep');
      const entry = {OriginalPath: path.join(root, 'work/chat-ui/profile-ABC123'),
        ArchivePath: profile, Bytes: 4, Files: 1};
      if (item.change) item.change(entry, root);
      if (item.setup) await item.setup(profile, root);
      const entries = item.duplicate ? [entry, entry] : [entry];
      await fs.writeFile(path.join(storage, 'repository-tidy-2026-10-10.json'),
        JSON.stringify({ArchivedDirectories: entries.length, Archived: entries}));
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
        ...(item.args || (item.success ? [] : ['-Apply']))];
      const result = spawnSync(engine, args,
        {encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 15000, windowsHide: true});
      assert.ifError(result.error);
      assert.equal(result.status === 0, !!item.success, result.stderr);
      assert.ok((result.stdout + result.stderr).includes(item.expected), result.stdout + result.stderr);
      const reportPath = path.join(storage, 'cleanup-legacy-test-profiles-result.json');
      if (item.deleted) {
        assert.equal(await fs.stat(profile).catch(() => null), null);
        const report = JSON.parse((await fs.readFile(reportPath, 'utf8')).replace(/^\uFEFF/, ''));
        assert.equal(report.RemovedDirectories, 1);
        assert.equal(report.FreedBytes, 4);
        assert.equal(report.Failure, null);
        const again = spawnSync(engine, args,
          {encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 15000, windowsHide: true});
        assert.ifError(again.error);
        assert.equal(again.status, 0, again.stderr);
        assert.ok(again.stdout.includes('Nothing to clean.'), again.stdout);
      } else {
        assert.equal(await fs.readFile(path.join(profile, 'sentinel.txt'), 'utf8'), 'keep');
        assert.equal(await fs.stat(reportPath).catch(() => null), null);
      }
      if (item.name === 'linked-contents') {
        assert.equal(await fs.readFile(path.join(root, 'outside-profile/keep.txt'), 'utf8'), 'keep');
      }
    });
  } finally {
    await work.close();
  }
});
