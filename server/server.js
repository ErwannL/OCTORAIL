// Serveur OCTORAIL : sert le build (dist/) et relaie l'état des salons (1 à 8 joueurs).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = +process.env.PORT || 8787;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const http = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    const file = join(DIST, p);
    if (!file.startsWith(DIST)) throw 0;
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

const rooms = new Map(); // code -> { players: Map(id -> {ws, state}), shared }
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
    } else if (m.t === 'state') { me.state = m.s; bcast({ t: 'state', id, s: m.s }, id); }
    else if (m.t === 'shared') { room.shared = m.shared; bcast({ t: 'shared', shared: m.shared, from: id }, id); }
    else if (m.t === 'event') { bcast({ t: 'event', id, e: m.e }, id); }
  });
  ws.on('close', () => { room.players.delete(id); bcast({ t: 'leave', id }); if (!room.players.size) rooms.delete(code); });
});

http.listen(PORT, () => console.log(`OCTORAIL serveur sur http://localhost:${PORT}`));
