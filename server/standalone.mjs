// OCTORAIL.exe : serveur autonome (jeu embarqué + salons multijoueur). Lancé par l'hôte ; les amis ouvrent l'adresse affichée.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';

let sea = null; try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }
const PORT = +process.env.PORT || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const DIST = join(process.cwd(), 'dist');

async function load(p) {
  if (sea) { try { return Buffer.from(sea.getAsset('dist' + p)); } catch { return null; } }
  try { return await readFile(join(DIST, p)); } catch { return null; }
}

const http = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
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

http.on('error', e => { if (e.code === 'EADDRINUSE') { console.log(`\n  Le port ${PORT} est déjà utilisé : OCTORAIL tourne peut-être déjà. Ferme l'autre fenêtre.\n`); setTimeout(() => process.exit(1), 8000); } else throw e; });
http.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  ==============================================');
  console.log('     OCTORAIL — serveur de salon lancé (hôte)');
  console.log('  ==============================================\n');
  console.log(`  Toi (hôte)          : http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Amis, même réseau   : http://${ip}:${PORT}`);
  console.log(`\n  Amis par Internet : redirige le port ${PORT} (TCP) de ta box vers ce PC,`);
  console.log(`  puis donne-leur http://TON-IP-PUBLIQUE:${PORT}  (ou utilise un VPN type Radmin/ZeroTier/Tailscale).`);
  console.log('\n  Dans le jeu : même « Code salon » pour tout le monde, puis « Rejoindre / créer un salon ».');
  console.log('  Laisse cette fenêtre ouverte pendant la partie. Ferme-la pour arrêter le serveur.\n');
  if (!process.env.NO_OPEN) exec(process.platform === 'win32' ? `start "" "http://localhost:${PORT}"` : `xdg-open http://localhost:${PORT}`, () => {});
});
