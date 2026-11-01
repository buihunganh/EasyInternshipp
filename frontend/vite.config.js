import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Paths are relative to this folder (frontend/), so the config works from any working directory.
const root = fileURLToPath(new URL('.', import.meta.url));
const pages = ['index.html', ...readdirSync(resolve(root, 'pages')).map(name => `pages/${name}/index.html`)];

export default defineConfig({
  root,
  envDir: resolve(root, '..'),   // .env.local lives at the repo root
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map(file => [file, resolve(root, file)]))
    }
  }
});
