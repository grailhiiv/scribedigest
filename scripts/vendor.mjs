import { cp, mkdir } from 'node:fs/promises';
const dest = new URL('../scribe-flipbook/assets/vendor/', import.meta.url);
await mkdir(dest, { recursive: true });
for (const file of ['pdf', 'pdf.worker']) await cp(`node_modules/pdfjs-dist/build/${file}.mjs`, new URL(`${file}.js`, dest));
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) await cp(`node_modules/pdfjs-dist/${dir}`, new URL(dir, dest), { recursive: true });
await cp('node_modules/page-flip/dist/js/page-flip.browser.js', new URL('page-flip.js', dest));
await cp('node_modules/pdfjs-dist/LICENSE', new URL('PDFJS-LICENSE.txt', dest));
await cp('node_modules/page-flip/LICENSE', new URL('PAGE-FLIP-LICENSE.txt', dest));
