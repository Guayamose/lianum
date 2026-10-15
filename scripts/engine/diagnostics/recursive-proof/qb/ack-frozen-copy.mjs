import { acknowledgeFrozenCopy } from './frozen-copy-gate.mjs';
process.on('uncaughtException', e => { console.error(e.message); process.exit(1); });
const [role, dir, authorityPath, signerPath] = process.argv.slice(2);
console.log(JSON.stringify(acknowledgeFrozenCopy(role, dir, authorityPath, signerPath)));
