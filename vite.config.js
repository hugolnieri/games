import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        → dist/        (arquivos separados, para hospedar)
// `npm run build:single` → dist-single/ (um único index.html com tudo inline, abre direto do disco)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      target: 'es2022', // há `static` class fields
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
    },
  };
});
