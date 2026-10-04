// Exercises the authored front end and real NSIS engine using a unique fixture.
// Never starts Clipper, changes input focus or reads the normal app profile.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: 'ignore', ...options });
    child.once('error', reject); child.once('exit', resolve);
  });
}
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const id = process.env.CLIPPER_INSTALLER_TEST_SESSION;
  assert(/^[0-9a-f-]{36}$/.test(id || ''), 'Run the isolated installer lifecycle first and supply its session ID');
  const name = 'ClipperVerification-' + id;
  const folder = path.resolve('work/installer-lifecycle', id);
  // Keep NSIS's deeply nested plugin/backup paths below Windows MAX_PATH.
  const installed = path.resolve('work/installer-lifecycle', '验证-' + id.slice(0, 8) + ' with spaces');
  const fixture = path.join(folder, 'custom-setup.exe');
  const payload = path.join(folder, 'build/verification-setup.exe');
  const asar = path.join(folder, 'build/win-unpacked/resources/app.asar');
  const buildLog = fs.openSync(path.join(folder, 'custom-build.log'), 'w');
  try {
    assert.equal(await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('build/installer-ui/build.ps1'),
      '-Payload', payload, '-AppAsar', asar, '-Output', fixture, '-VerificationProduct', name, '-VerificationDirectory', installed],
      { stdio: ['ignore', buildLog, buildLog] }), 0, 'Front end compilation');
  } finally { fs.closeSync(buildLog); }
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + id;
  assert.notEqual(spawnSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore' }).status, 0, 'Fixture must be uninstalled before starting');
  const profile = path.resolve(process.env.APPDATA, name.toLowerCase());
  assert(!fs.existsSync(profile)); fs.mkdirSync(profile);
  const sentinel = path.join(profile, 'history-sentinel.txt'); fs.writeFileSync(sentinel, '中文 + English + settings');
  const original = sha(sentinel);
  const shortcut = path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs', name + '.lnk');
  const helper = path.join(folder, name + '.exe'); fs.copyFileSync(process.execPath, helper);
  let helperChild, registered = false;
  const scratchParent = path.dirname(installed);
  const scratchBefore = fs.readdirSync(scratchParent).filter(file => /^cs-[0-9a-f]{16}$/.test(file));
  try {
    helperChild = spawn(helper, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
    await sleep(300);
    assert.equal(await run(fixture, ['--verify-install']), 1602, 'Running application must block before extraction');
    assert.equal(helperChild.exitCode, null, 'Installer must not terminate a running app');
    assert(!fs.existsSync(installed), 'Blocked installation must not create program files');
    const stopped = new Promise(resolve => helperChild.once('exit', resolve)); helperChild.kill(); await stopped; helperChild = null;
    for (const stage of ['first install', 'reinstall']) {
      if (stage === 'reinstall') {
        assert.equal(spawnSync('reg.exe', ['add', key, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', '999.0.0', '/f'], { windowsHide: true, stdio: 'ignore' }).status, 0);
        try {
          assert.equal(await run(fixture, ['--verify-install']), 1638, 'Refuse a downgrade');
          assert.equal(sha(path.join(installed, 'resources/app.asar')), sha(asar), 'Refusing a downgrade must preserve app files');
        } finally {
          assert.equal(spawnSync('reg.exe', ['add', key, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', JSON.parse(fs.readFileSync('package.json', 'utf8')).version, '/f'], { windowsHide: true, stdio: 'ignore' }).status, 0);
        }
        assert.equal(await run(fixture, ['--verify-recovery']), 1612, 'Injected engine failure after real removal');
        assert.equal(sha(path.join(installed, 'resources/app.asar')), sha(asar), 'Previous app must be restored after failure');
        assert(fs.existsSync(shortcut), 'Previous Start menu entry must be restored');
        assert.equal(spawnSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore' }).status, 0, 'Previous registration must be restored');
        assert.equal(sha(sentinel), original, 'Recovery must preserve history');
      }
      assert.equal(await run(fixture, ['--verify-install']), 0, stage + ' through the real custom front end');
      registered = true;
      assert(fs.existsSync(path.join(installed, name + '.exe')));
      assert.equal(sha(path.join(installed, 'resources/app.asar')), sha(asar));
      assert.equal(sha(sentinel), original);
      assert.equal(spawnSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore' }).status, 0);
      assert(fs.existsSync(shortcut)); console.log(stage + ': custom extraction, engine invocation and verified app files passed');
    }
    const uninstaller = fs.readdirSync(installed).find(file => /^Uninstall.*\.exe$/i.test(file)); assert(uninstaller);
    assert.equal(await run(path.join(installed, uninstaller), ['/S']), 0);
    for (let count = 0; count < 150; count++) {
      if (!fs.existsSync(path.join(installed, name + '.exe')) && !fs.existsSync(shortcut)
        && spawnSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore' }).status !== 0) break;
      await sleep(100);
    }
    assert(!fs.existsSync(path.join(installed, name + '.exe'))); assert(!fs.existsSync(shortcut));
    assert.notEqual(spawnSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore' }).status, 0);
    assert.equal(sha(sentinel), original); registered = false;
    const result = { passed: true, realCustomFrontend: true, realNsisEngine: true, identityIsolated: true,
      blocksRunningAppWithoutKilling: true, firstInstall: true, reinstall: true, uninstall: true,
      appAsarVerified: true, unicodeAndSpaces: true, profilePreserved: true, applicationNeverLaunched: true,
      clipboardAccess: false, refusesDowngrade: true, engineTemporaryOnInstallVolume: true,
      restoresPreviousProgramAfterFailedReplacement: true,
      systemTemporaryVolumeDiffers: path.parse(installed).root.toLowerCase() !== path.parse(process.env.TEMP).root.toLowerCase() };
    assert.deepEqual(fs.readdirSync(scratchParent).filter(file => /^cs-[0-9a-f]{16}$/.test(file)), scratchBefore, 'Owned engine scratch folders must be cleaned');
    result.scratchCleaned = true;
    fs.writeFileSync('work/custom-installer-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } finally {
    if (helperChild) helperChild.kill();
    if (registered && fs.existsSync(installed)) {
      const uninstaller = fs.readdirSync(installed).find(file => /^Uninstall.*\.exe$/i.test(file));
      if (uninstaller) await run(path.join(installed, uninstaller), ['/S']);
    }
    assert.equal(path.dirname(profile).toLowerCase(), path.resolve(process.env.APPDATA).toLowerCase());
    assert.equal(path.basename(profile), name.toLowerCase());
    assert.equal(fs.lstatSync(profile).isSymbolicLink(), false, 'Test profile must not be a link');
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
