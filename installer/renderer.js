const $ = id => document.getElementById(id);
let stage = 'welcome';
let directory = '';
let existingDirectory = '';
const messages = {
  running: 'Clip 正在运行。请先从托盘菜单退出，然后重试。',
  newer: '电脑上已有更新版本的 Clip。',
  space: '所选磁盘空间不足，请更换安装位置。',
  integrity: '安装包验证失败，请重新下载安装程序。',
  'installed-integrity': '安装完成后文件验证失败，请重试。',
  cancelled: '安装已取消。',
  engine: '安装未能完成，请检查文件权限后重试。',
  occupied: '所选位置已有其他文件，请选择空目录。',
  restore: '旧版未能自动恢复。请查看错误详情中的备份位置。',
  invalidPath: '请选择有效的安装位置。'
};
function show(next) {
  stage = next;
  for (const node of document.querySelectorAll('.scene')) node.classList.toggle('active', node.id === next);
  const secondary = $('secondary'), primary = $('primary');
  secondary.hidden = next === 'working';
  if (next === 'welcome') {secondary.textContent = '取消'; primary.textContent = '开始安装'; primary.disabled = false;}
  if (next === 'working') {primary.textContent = '安装中'; primary.disabled = true;}
  if (next === 'done') {secondary.textContent = '关闭'; primary.textContent = '打开 Clip'; primary.disabled = false;}
  if (next === 'failed') {secondary.textContent = '关闭'; primary.textContent = '重试'; primary.disabled = false;}
}
function progress(value) {
  if (value.stage === 'done') {show('done'); $('installed-path').textContent = value.directory; return;}
  if (value.stage === 'failed') {
    show('failed');
    $('failure-message').textContent = messages[value.reason] || messages.engine;
    $('failure-technical').textContent = String(value.message || '').trim();
    $('failure-details').hidden = !$('failure-technical').textContent;
    $('failure-details').open = false;
    return;
  }
  show('working');
  const text = {checking:'正在检查安装包',extracting:'正在准备安装文件',installing:'正在安装 Clip',verifying:'正在完成安装'};
  $('work-title').textContent = text[value.stage] || text.checking;
  $('work-detail').textContent = value.detail || '';
  $('progress-caption').textContent = value.caption || '';
  $('progress-fill').style.width = value.percent == null ? '' : `${value.percent}%`;
  $('progress-fill').parentElement.classList.toggle('indeterminate', value.percent == null);
}
window.setup.onProgress(progress);
function normalizeDirectory(value) {
  const path = value.trim().replace(/\\+$/, '');
  if (!/^[a-z]:\\/i.test(value.trim())) return value.trim();
  if (existingDirectory && value.trim().toLowerCase() === existingDirectory.toLowerCase()) return existingDirectory;
  return /(?:^|\\)Clip$/i.test(path) ? path : `${path}\\Clip`;
}
window.setup.state().then(value => {directory = value.directory; existingDirectory = value.installed ? value.directory : ''; $('directory').value = directory; $('version').textContent = `版本 ${value.version}`;}).catch(error=>progress({stage:'failed',message:error.message}));
$('browse').addEventListener('click', async () => {const value = await window.setup.chooseDirectory(); if(value) {$('directory').value=value; directory=value; $('path-error').textContent='';}});
$('directory').addEventListener('input', () => {$('path-error').textContent='';});
$('directory').addEventListener('blur', () => {if (/^[a-z]:\\/i.test($('directory').value.trim())) $('directory').value = normalizeDirectory($('directory').value);});
$('primary').addEventListener('click', async () => {
  if(stage==='done') {await window.setup.launch(); return;}
  if(stage==='failed') {show('welcome'); return;}
  if(stage!=='welcome') return;
  directory=normalizeDirectory($('directory').value);
  $('directory').value=directory;
  if(!/^[a-z]:\\[^<>"|?*]+$/i.test(directory)) {$('path-error').textContent=messages.invalidPath; return;}
  progress({stage:'checking',detail:'正在验证安装位置',caption:'准备中'});
  try {await window.setup.install(directory);} catch(error) {progress({stage:'failed',message:error.message});}
});
$('secondary').addEventListener('click', () => {if(stage!=='working') window.setup.close();});
$('close').addEventListener('click', () => {if(stage!=='working') window.setup.close();});
$('minimize').addEventListener('click', () => window.setup.minimize());
