// Re-export every diagrams/*.drawio to diagrams/export/{pdf,png}/ with the draw.io desktop CLI.
//   npm run diagrams:export        (set DRAWIO to the draw.io executable if it is not on the default path)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const candidates = [
  process.env.DRAWIO,
  process.platform === 'win32' && join(process.env.LOCALAPPDATA ?? '', 'Programs', 'draw.io', 'draw.io.exe'),
  process.platform === 'win32' && join(process.env.ProgramFiles ?? '', 'draw.io', 'draw.io.exe'),
  process.platform === 'darwin' && '/Applications/draw.io.app/Contents/MacOS/draw.io',
  'drawio',
].filter(Boolean);
const exe = candidates.find(c => c === 'drawio' || existsSync(c));

for (const fmt of ['pdf', 'png']) mkdirSync(join(dir, 'export', fmt), { recursive: true });
const files = readdirSync(dir).filter(f => f.endsWith('.drawio'));
for (const file of files) {
  const name = file.replace(/\.drawio$/, '');
  execFileSync(exe, ['-x', '-f', 'pdf', '--crop', '-b', '10', '-o', join(dir, 'export', 'pdf', `${name}.pdf`), join(dir, file)], { stdio: 'ignore' });
  execFileSync(exe, ['-x', '-f', 'png', '-s', '1.5', '-b', '10', '-o', join(dir, 'export', 'png', `${name}.png`), join(dir, file)], { stdio: 'ignore' });
  console.log('exported', name);
}
console.log(`${files.length} diagrams → diagrams/export/{pdf,png}`);
