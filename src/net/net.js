// Client réseau : WebSocket vers le serveur de salon. Repli hors-ligne silencieux.
export class Net {
  constructor() { this.ws = null; this.id = null; this.peers = new Map(); this.handlers = {}; this.online = false; }
  on(t, f) { this.handlers[t] = f; }
  connect(room, hello) {
    return new Promise(res => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const port = location.port === '5173' ? '8787' : location.port;
      const url = `${proto}://${location.hostname}${port ? ':' + port : ''}/ws?room=${encodeURIComponent(room)}`;
      let done = false;
      try { this.ws = new WebSocket(url); } catch { return res(false); }
      const to = setTimeout(() => { if (!done) { done = true; res(false); } }, 15000); // PC lents : le message de bienvenue peut arriver tard
      this.ws.onopen = () => { this.send({ t: 'hello', ...hello }); };
      this.ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.t === 'welcome') { this.id = m.id; this.online = true; if (!done) { done = true; clearTimeout(to); res(m); } }
        this.handlers[m.t]?.(m);
      };
      this.ws.onclose = () => { this.online = false; this.handlers.close?.(); if (!done) { done = true; res(false); } };
      this.ws.onerror = () => {};
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
}
