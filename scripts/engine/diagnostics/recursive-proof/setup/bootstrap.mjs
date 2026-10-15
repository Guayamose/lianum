import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Local setup only: no package execution, download or personal npm config read.
const root = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(resolve(root, '.local'), { recursive: true });
for (const name of ['npm-userconfig', 'npm-globalconfig']) {
  writeFileSync(resolve(root, '.local', name), '');
}
console.log('Created empty project-local npm configuration files.');
