// OCTORAIL.exe : serveur autonome (jeu embarqué + salons multijoueur). Lancé par l'hôte ; les amis ouvrent l'adresse affichée.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { exec, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { WebSocketServer } from 'ws';

let sea = null; try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }
let PORT = +process.env.PORT || 8787;
const myIps = () => Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address + (PORT !== 8787 ? ':' + PORT : ''));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const DIST = join(process.cwd(), 'dist');

async function load(p) {
  if (sea) { try { return Buffer.from(sea.getAsset('dist' + p)); } catch { return null; } }
  try { return await readFile(join(DIST, p)); } catch { return null; }
}

const http = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
  if (p === '/info') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ips: myIps(), port: PORT })); }
  if (p === '/' || p === '') p = '/index.html';
  if (p.includes('..')) { res.writeHead(400); return res.end(); }
  const data = await load(p);
  if (!data) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data);
});

const rooms = new Map();
let nextId = 1;
const wss = new WebSocketServer({ server: http, path: '/ws' });
wss.on('connection', (ws, req) => {
  const code = (new URL(req.url, 'http://x').searchParams.get('room') || 'public').toUpperCase().slice(0, 12);
  if (!rooms.has(code)) rooms.set(code, { players: new Map(), shared: null });
  const room = rooms.get(code);
  if (room.players.size >= 8) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
  const id = nextId++;
  const used = new Set([...room.players.values()].map(p => p.slot));
  let slot = 0; while (used.has(slot)) slot++;
  const me = { ws, info: null, state: null, slot };
  room.players.set(id, me);
  const bcast = (o, except) => { const s = JSON.stringify(o); for (const [pid, p] of room.players) if (pid !== except && p.ws.readyState === 1) p.ws.send(s); };
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      me.info = { name: String(m.name || 'Passager').slice(0, 14), color: String(m.color || '#e0703a').slice(0, 9) };
      const others = [...room.players].filter(([pid, p]) => pid !== id && p.info).map(([pid, p]) => ({ id: pid, ...p.info, state: p.state, slot: p.slot }));
      ws.send(JSON.stringify({ t: 'welcome', id, room: code, others, shared: room.shared, slot }));
      bcast({ t: 'join', id, ...me.info, slot }, id);
      console.log(`  + ${me.info.name} a rejoint le salon ${code} (${room.players.size}/8)`);
    } else if (m.t === 'state') { me.state = m.s; bcast({ t: 'state', id, s: m.s }, id); }
    else if (m.t === 'shared') { room.shared = m.shared; bcast({ t: 'shared', shared: m.shared, from: id }, id); }
    else if (m.t === 'event') { bcast({ t: 'event', id, e: m.e }, id); }
  });
  ws.on('close', () => { room.players.delete(id); bcast({ t: 'leave', id }); if (me.info) console.log(`  - ${me.info.name} est parti`); if (!room.players.size) rooms.delete(code); });
});

http.on('error', e => { if (e.code === 'EADDRINUSE' && PORT < 8797) { PORT++; http.listen(PORT, '0.0.0.0'); } else { console.log('Erreur serveur :', e.message); setTimeout(() => process.exit(1), 8000); } });
http.on('listening', () => {
  const ips = myIps();
  console.log('\n  ==============================================');
  console.log('     OCTORAIL — serveur de salon lancé (hôte)');
  console.log('  ==============================================\n');
  console.log(`  Toi (hôte)          : http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Adresse à donner     : ${ip}${ip.startsWith('25.') ? '   <- Hamachi' : ''}`);
  console.log('\n  Hôte : menu « Créer un salon » → « Héberger ». Amis : « Rejoindre un ami » → ton adresse (Hamachi : 25.x.x.x).');
  console.log('  Laisse cette fenêtre ouverte pendant la partie. Ferme-la pour arrêter le serveur.\n');
  if (!process.env.NO_OPEN) openApp(`http://localhost:${PORT}`);
});
http.listen(PORT, '0.0.0.0');

// fenêtre d'application (sans barre d'adresse) : Edge (présent sur tout Windows 10/11) ou Chrome ; sinon navigateur par défaut
function openApp(url) {
  const L = process.env.LOCALAPPDATA || '', PF = process.env['ProgramFiles'] || 'C:\\Program Files', PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const cands = [PF86 + '\\Microsoft\\Edge\\Application\\msedge.exe', PF + '\\Microsoft\\Edge\\Application\\msedge.exe', PF + '\\Google\\Chrome\\Application\\chrome.exe', PF86 + '\\Google\\Chrome\\Application\\chrome.exe', L + '\\Google\\Chrome\\Application\\chrome.exe'];
  const exe = process.platform === 'win32' ? cands.find(c => existsSync(c)) : null;
  if (!exe) { exec(process.platform === 'win32' ? `start "" "${url}"` : `xdg-open ${url}`, () => {}); return; }
  const prof = (L || process.cwd()) + '\\OCTORAIL\\fenetre'; try { mkdirSync(prof, { recursive: true }); } catch {}
  const w = spawn(exe, [`--app=${url}`, `--user-data-dir=${prof}`, '--window-size=1600,900', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'], { stdio: 'ignore' });
  console.log('  La fenêtre du jeu est ouverte. Fermer le jeu arrête aussi le serveur.\n');
  w.on('exit', () => { console.log('  Jeu fermé : arrêt du serveur.'); setTimeout(() => process.exit(0), 500); });
}
