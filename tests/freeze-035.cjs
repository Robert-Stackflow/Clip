const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=process.cwd(),delivery=path.resolve('../delivery-0.35.0');
assert.equal(JSON.parse(fs.readFileSync('package.json')).version,'0.35.0');
assert(delivery.startsWith(path.resolve('..')+path.sep));
assert(fs.existsSync(path.join(delivery,'node_modules')));
assert(!fs.lstatSync(path.join(delivery,'node_modules')).isSymbolicLink(),'Only private dependencies can be packaged');
const folders=['assets','build','docs','installer-ui','licenses','scripts','src','tests'];
for(const folder of folders){const target=path.join(delivery,folder);assert(!fs.existsSync(target),target);fs.cpSync(path.join(source,folder),target,{recursive:true,errorOnExist:true,force:false});}
for(const entry of fs.readdirSync(source,{withFileTypes:true}).filter(e=>e.isFile())){const target=path.join(delivery,entry.name);assert(!fs.existsSync(target),target);fs.copyFileSync(path.join(source,entry.name),target);}
assert.equal(JSON.parse(fs.readFileSync(path.join(delivery,'package.json'))).version,'0.35.0');
console.log('Source frozen for Clipper 0.35.0 with private dependencies.');
