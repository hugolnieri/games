// Otimiza as malhas de personagem geradas no Higgsfield (GLB ~1,5 MB) para o navegador:
// simplifica, quantiza e converte a textura para WebP 512 (~150 kB), grava em src/assets/models/
// e reescreve src/assets/models.js.
//   node tools/models.mjs art-src/models
// Nome esperado: art-src/models/<id-do-personagem>.glb. Usa `npx @gltf-transform/cli`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(process.argv[2] || 'art-src/models');
const out = path.resolve('src/assets/models');
fs.mkdirSync(out, { recursive: true });
const ids = [];
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.glb')).sort()) {
  const id = path.basename(f, '.glb');
  const dst = path.join(out, id + '.glb');
  execFileSync('npx', ['--yes', '@gltf-transform/cli', 'optimize', path.join(src, f), dst, '--compress', 'false', '--texture-compress', 'webp', '--texture-size', '512', '--simplify-ratio', '0.6', '--simplify-error', '0.002'], { stdio: 'ignore' });
  ids.push(id);
  console.log(`${id}.glb  ${(fs.statSync(dst).size / 1024).toFixed(0)} kB`);
}
const js = `// GERADO por tools/models.mjs a partir de art-src/models/ (malhas criadas no Higgsfield). Não edite à mão.
${ids.map((id) => `import ${id} from './models/${id}.glb?url';`).join('\n')}

/** Malha esculpida por personagem. Quem não tem malha usa o modelo de primitivas. */
export const MODEL_URLS = { ${ids.join(', ')} };
`;
fs.writeFileSync(path.resolve('src/assets/models.js'), js);
console.log('src/assets/models.js atualizado');
