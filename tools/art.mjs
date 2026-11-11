// Otimiza a arte gerada (PNG ~1,5 MB cada) para o navegador: recorta em 16:9, reduz e grava WebP
// em src/assets/art/, depois reescreve src/assets/art.js.
//   node tools/art.mjs art-src
// Nomes esperados em art-src/: <id-do-minigame>.png, key.png (arte do menu), vitoria.png (campeão).
// Usa o Chromium do Playwright só como codificador de imagem (npm i -D playwright, se não tiver).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const src = path.resolve(process.argv[2] || 'art-src');
const out = path.resolve('src/assets/art');
fs.mkdirSync(out, { recursive: true });
const SIZES = { key: [1120, 630, 0.8], vitoria: [960, 540, 0.8] };
const CARD = [448, 252, 0.76];

const browser = await chromium.launch();
const page = await browser.newPage();
const names = [];
const list = fs.readdirSync(src).filter((x) => /\.(png|jpe?g|webp)$/i.test(x)).sort();
// art-src/chars/<personagem>.png: ficha do personagem com fundo transparente
const charDir = path.join(src, 'chars');
if (fs.existsSync(charDir)) for (const x of fs.readdirSync(charDir).filter((y) => /\.png$/i.test(y)).sort()) list.push('chars/' + x);
for (const f of list) {
  const isChar = f.startsWith('chars/');
  const name = (isChar ? 'char_' : '') + path.basename(f, path.extname(f));
  if (name.includes('-')) continue; // rascunhos (ex.: key-text.png)
  const [w, h, q] = isChar ? [400, 400, 0.82] : SIZES[name] || CARD;
  const data = 'data:image/png;base64,' + fs.readFileSync(path.join(src, f)).toString('base64');
  const url = await page.evaluate(async ([data, w, h, q]) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const s = Math.max(w / img.width, h / img.height);
    c.getContext('2d').drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    return c.toDataURL('image/webp', q);
  }, [data, w, h, q]);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(out, name + '.webp'), buf);
  names.push(name);
  console.log(`${name}.webp  ${w}x${h}  ${(buf.length / 1024).toFixed(0)} kB`);
}
await browser.close();

const v = (n) => 'a_' + n.replace(/\W/g, '_');
const special = ['key', 'vitoria'];
const js = `// GERADO por tools/art.mjs a partir de art-src/ (arte criada no Higgsfield). Não edite à mão.
${names.map((n) => `import ${v(n)} from './art/${n}.webp';`).join('\n')}

/** Arte de apoio: cartões dos minigames, arte do menu e do campeão. Os jogáveis são sempre 3D. */
export const ART = {
  minigames: { ${names.filter((n) => !special.includes(n) && !n.startsWith('char_')).map((n) => `${n}: ${v(n)}`).join(', ')} },
  chars: { ${names.filter((n) => n.startsWith('char_')).map((n) => `${n.slice(5)}: ${v(n)}`).join(', ')} },
  key: ${names.includes('key') ? v('key') : 'null'},
  vitoria: ${names.includes('vitoria') ? v('vitoria') : 'null'},
};
`;
fs.writeFileSync(path.resolve('src/assets/art.js'), js);
console.log('src/assets/art.js atualizado');
