import {spawnSync} from 'node:child_process';
import {mkdir,copyFile,writeFile,readdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const vswhere=join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');
const located=spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true});
if(located.status!==0||!located.stdout.trim())throw new Error('Visual Studio C++ x64 build tools are required');
const sdk=join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Windows Kits/10/Lib');
const sdkVersion=(await readdir(sdk)).filter(n=>/^\d+(\.\d+)+$/.test(n)).sort((a,b)=>b.localeCompare(a,'en',{numeric:true}))[0];
const ucrt=join(sdk,sdkVersion,'ucrt/x64');await access(join(ucrt,'libucrt.lib'));
await mkdir('work',{recursive:true});const command=resolve('work/build-document-info.cmd');
// Rust's MSVC discovery needs the complete SDK environment on a cold build.
await writeFile(command,`@echo off\r\ncall "${located.stdout.trim()}\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\r\nif errorlevel 1 exit /b 1\r\nset "RUSTFLAGS=-C target-feature=+crt-static"\r\ncargo build --release --locked --jobs 2 --manifest-path native/document-info/Cargo.toml --target-dir work/document-info-build\r\nexit /b %errorlevel%\r\n`);
const result=spawnSync('cmd.exe',['/d','/c',command],{stdio:'inherit',windowsHide:true,env:{...process.env,CARGO_ENCODED_RUSTFLAGS:['-C','target-feature=+crt-static','-L',`native=${ucrt}`].join('\x1f')}});
if(result.status!==0)throw new Error('Document information helper build failed');
await mkdir('dist/native',{recursive:true});
await copyFile('work/document-info-build/release/clipper-document-info.exe','dist/native/DocumentInfo.exe');
