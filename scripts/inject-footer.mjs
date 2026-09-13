import fs from 'node:fs/promises';
import path from 'node:path';
const template=await fs.readFile('public/footer-template.html','utf8');
const files=['index.html',...(await fs.readdir('pages',{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>path.join('pages',entry.name,'index.html'))];
for(const file of files){
  let html=await fs.readFile(file,'utf8');
  html=html.replace(/<footer[\s\S]*?<\/footer>/i,template);
  await fs.writeFile(file,html);
}
console.log(`Injected exact footer template into ${files.length} pages.`);
