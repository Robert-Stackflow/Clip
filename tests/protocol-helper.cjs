// Launched by Windows ShellExecute through a unique, temporary test protocol.
const {app}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const receipt=process.argv[2];
app.setPath('userData',path.join(path.dirname(receipt),'protocol-helper-profile'));
app.whenReady().then(()=>{fs.writeFileSync(receipt,JSON.stringify(process.argv));app.quit();});
