// OCTORAIL — application de bureau (Electron) : une vraie fenêtre de jeu, aucun terminal.
// Le serveur de salon (multijoueur 1-8) tourne caché dans l'application : héberger = ce PC, rejoindre = adresse d'un ami (Hamachi…).
const { app, BrowserWindow, Menu, shell } = require('electron');
const { exec } = require('node:child_process');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { WebSocketServer } = require('ws');

const DIST = path.join(__dirname, 'game');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
let PORT = 8787;
const myIps = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address + (PORT !== 8787 ? ':' + PORT : ''));

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
      if (p === '/ping') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end('{"ok":true}'); }
      if (p === '/firewall' && local) {
        // règle d'entrée pour le port du jeu sur tous les profils (privé + public : Hamachi est « public ») ; Windows demande l'autorisation admin
        const exe = process.execPath.replace(/'/g, "''");
        const cmd = `powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -WindowStyle Hidden -ArgumentList 'advfirewall firewall add rule name=OCTORAIL dir=in action=allow protocol=TCP localport=8787-8797 profile=any'; Start-Process netsh -Verb RunAs -WindowStyle Hidden -ArgumentList 'advfirewall firewall add rule name=OCTORAIL-app dir=in action=allow program=\"${exe}\" profile=any'"`;
        exec(cmd, err => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: !err, err: err ? String(err.message).slice(0, 200) : null })); }); return;
      }
      if (p === '/info') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ips: myIps(), port: PORT, desktop: true })); }
      if (p === '/' || p === '') p = '/index.html';
      const f = path.normalize(path.join(DIST, p));
      if (!f.startsWith(DIST)) { res.writeHead(400); return res.end(); }
      fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(data); });
    });
    const rooms = new Map(); let nextId = 1;
    const wss = new WebSocketServer({ server: srv, path: '/ws' });
    wss.on('connection', (ws, req) => {
      const code = (new URL(req.url, 'http://x').searchParams.get('room') || 'public').toUpperCase().slice(0, 12);
      if (!rooms.has(code)) rooms.set(code, { players: new Map(), shared: null });
      const room = rooms.get(code);
      if (room.players.size >= 8) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
      const id = nextId++, used = new Set([...room.players.values()].map(p => p.slot)); let slot = 0; while (used.has(slot)) slot++;
      const me = { ws, info: null, state: null, slot }; room.players.set(id, me);
      const bcast = (o, ex) => { const s = JSON.stringify(o); for (const [pid, p] of room.players) if (pid !== ex && p.ws.readyState === 1) p.ws.send(s); };
      ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.t === 'hello') { me.info = { name: String(m.name || 'Passager').slice(0, 14), color: String(m.color || '#e0703a').slice(0, 9) };
          const others = [...room.players].filter(([pid, p]) => pid !== id && p.info).map(([pid, p]) => ({ id: pid, ...p.info, state: p.state, slot: p.slot }));
          ws.send(JSON.stringify({ t: 'welcome', id, room: code, others, shared: room.shared, slot })); bcast({ t: 'join', id, ...me.info, slot }, id); }
        else if (m.t === 'state') { me.state = m.s; bcast({ t: 'state', id, s: m.s }, id); }
        else if (m.t === 'shared') { room.shared = m.shared; bcast({ t: 'shared', shared: m.shared, from: id }, id); }
        else if (m.t === 'event') bcast({ t: 'event', id, e: m.e }, id); });
      ws.on('close', () => { room.players.delete(id); bcast({ t: 'leave', id }); if (!room.players.size) rooms.delete(code); });
    });
    srv.on('error', e => { if (e.code === 'EADDRINUSE' && PORT < 8797) { PORT++; srv.listen(PORT, '0.0.0.0'); } else resolve(null); });
    srv.on('listening', () => resolve(PORT));
    srv.listen(PORT, '0.0.0.0');
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const port = await startServer();
  const win = new BrowserWindow({ width: 1600, height: 900, minWidth: 960, minHeight: 540, title: 'OCTORAIL', backgroundColor: '#120d08', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && (i.key === 'F11' || (i.alt && i.key === 'Enter'))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  win.loadURL(`http://localhost:${port || 8787}/`);
});
app.on('window-all-closed', () => app.quit());
