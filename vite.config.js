import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(['index.html', ...readdirSync('pages').map(name => `pages/${name}/index.html`)].map(file => [file, resolve(file)]))
    }
  }
});
