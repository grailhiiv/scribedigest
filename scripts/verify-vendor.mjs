import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
let checked = 0;
async function compare(source, dest) {
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(await readFile(source)), hash(await readFile(dest)), `Vendor mismatch: ${dest}`);
    checked++;
}
const dest = 'scribe-flipbook/assets/vendor';
for (const file of ['pdf','pdf.worker']) await compare(`node_modules/pdfjs-dist/build/${file}.mjs`,`${dest}/${file}.js`);
for (const directory of ['cmaps','standard_fonts','wasm']) {
    for (const file of await readdir(`node_modules/pdfjs-dist/${directory}`,{recursive:true,withFileTypes:true})) {
        if (file.isFile()) {
            const relative = `${file.parentPath.replaceAll('\\','/').split(`/${directory}`)[1] || ''}/${file.name}`;
            await compare(`node_modules/pdfjs-dist/${directory}${relative}`,`${dest}/${directory}${relative}`);
        }
    }
}
await compare('node_modules/page-flip/dist/js/page-flip.browser.js', `${dest}/page-flip.js`);
await compare('node_modules/pdfjs-dist/LICENSE', `${dest}/PDFJS-LICENSE.txt`);
await compare('node_modules/page-flip/LICENSE', `${dest}/PAGE-FLIP-LICENSE.txt`);
console.log(`PASS: ${checked} bundled dependency files match installed packages (SHA-256).`);
