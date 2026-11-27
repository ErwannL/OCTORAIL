// Construit release/OCTORAIL.exe : application de bureau Electron (portable, un seul .exe), sans terminal.
// Prérequis : un dossier outils avec electron + electron-builder installés (OUTILS=/tmp/elec par défaut).
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const TOOLS = process.env.OUTILS || '/tmp/elec', STAGE = join(TOOLS, 'app'), ROOT = process.cwd();
const sh = (c, cwd = ROOT) => execSync(c, { stdio: 'inherit', cwd });
sh('npx vite build');
rmSync(STAGE, { recursive: true, force: true }); mkdirSync(STAGE, { recursive: true });
cpSync('desktop/main.cjs', join(STAGE, 'main.cjs'));
if (existsSync('desktop/icon.png')) cpSync('desktop/icon.png', join(STAGE, 'icon.png'));
cpSync('dist', join(STAGE, 'game'), { recursive: true });
cpSync('node_modules/ws', join(STAGE, 'node_modules/ws'), { recursive: true });
writeFileSync(join(STAGE, 'package.json'), JSON.stringify({ name: 'octorail', productName: 'OCTORAIL', version: '1.0.37', description: 'OCTORAIL — huit voies, huit mondes', author: 'OCTORAIL', main: 'main.cjs', dependencies: { ws: '8.18.0' } }, null, 1));
writeFileSync(join(TOOLS, 'builder.json'), JSON.stringify({
  appId: 'com.octorail.game', productName: 'OCTORAIL', electronVersion: '33.2.1',
  directories: { app: STAGE, output: join(TOOLS, 'out') }, npmRebuild: false, asar: true,
  win: { target: [{ target: 'portable', arch: ['x64'] }, { target: 'dir', arch: ['x64'] }], signAndEditExecutable: false },
  portable: { artifactName: 'OCTORAIL.exe' },
}, null, 1));
sh(`npx electron-builder --win --config ${join(TOOLS, 'builder.json')}`, TOOLS);
mkdirSync('release', { recursive: true });
cpSync(join(TOOLS, 'out', 'OCTORAIL.exe'), 'release/OCTORAIL.exe');
console.log('OK -> release/OCTORAIL.exe ; version dossier (Steam) : ' + join(TOOLS, 'out', 'win-unpacked'));
