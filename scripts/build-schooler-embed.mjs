import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/schooler-embed/player.ts');
const outDir = path.join(root, 'public');
const overlayPath = path.join(outDir, 'schooler-player-overlay.js');
const snippetPath = path.join(outDir, 'schooler-js-embed-snippet.js');

await mkdir(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2018'],
  minify: false,
  legalComments: 'none',
  loader: {
    '.css': 'text',
  },
  logLevel: 'info',
});

const js = result.outputFiles?.[0]?.text;
if (!js) {
  throw new Error('esbuild did not produce output');
}

await writeFile(overlayPath, js, 'utf8');
await writeFile(snippetPath, `<script>\n${js}</script>\n`, 'utf8');

const bytes = Buffer.byteLength(js, 'utf8');
console.log(`built ${path.relative(root, overlayPath)} (${bytes} bytes)`);
console.log(`built ${path.relative(root, snippetPath)}`);
