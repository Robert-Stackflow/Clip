import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const run=promisify(execFile);await mkdir('dist/native',{recursive:true});await mkdir('work',{recursive:true});
const {stdout}=await run(join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe'),['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{windowsHide:true});
const installation=stdout.trim();if(!installation)throw Error('Visual Studio C++ x64 is required for SourceHost');
const script=resolve('work/build-sources.cmd');await writeFile(script,`@echo off\r\ncall "${installation}\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\r\nif errorlevel 1 exit /b 1\r\ncl /nologo /std:c++20 /EHsc /MT /O2 /utf-8 /DUNICODE /D_UNICODE native\\SourceHost.cpp /Fe:dist\\native\\SourceHost.exe /Fo:work\\source-host.obj /link ole32.lib oleaut32.lib oleacc.lib uiautomationcore.lib windowscodecs.lib dwmapi.lib user32.lib gdi32.lib shell32.lib\r\n`);
await run('cmd.exe',['/d','/c',script],{cwd:resolve('.'),windowsHide:true});
