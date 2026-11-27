// Construit release/OCTORAIL.exe (Windows x64) : Node SEA + jeu (dist/) embarqué + serveur de salon.
// Usage : node tools/build-exe.mjs <chemin vers node.exe Windows de la même version que `node -v`>
import { execSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const nodeExe = process.argv[2];
if (!nodeExe) { console.error('chemin de node.exe (Windows) requis'); process.exit(1); }
const sh = c => execSync(c, { stdio: 'inherit' });
mkdirSync('release', { recursive: true }); mkdirSync('build', { recursive: true });
sh('npx vite build');
sh('npx esbuild server/standalone.mjs --bundle --platform=node --format=cjs --target=node22 --outfile=build/octorail-server.cjs');
const assets = {};
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else assets['dist/' + relative('dist', p).replace(/\\/g, '/')] = p; } };
walk('dist');
writeFileSync('build/sea-config.json', JSON.stringify({ main: 'build/octorail-server.cjs', output: 'build/sea-prep.blob', disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 1));
sh('node --experimental-sea-config build/sea-config.json');
copyFileSync(nodeExe, 'release/OCTORAIL.exe');
sh('npx postject release/OCTORAIL.exe NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2');
console.log('OK -> release/OCTORAIL.exe', Object.keys(assets).length, 'fichiers embarqués');
