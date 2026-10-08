// The online client. One socket to the same server that served the page.
// Messages are JSON; see server.js for the lobby side.
export function createNet(handlers) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws = null, open = false, queue = [];
  const N = { connected: () => open };

  N.connect = function () {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = () => { open = true; for (const m of queue) ws.send(m); queue = []; handlers.open && handlers.open(); };
    ws.onclose = () => { open = false; handlers.close && handlers.close(); };
    ws.onerror = () => {};
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handlers.msg && handlers.msg(m); };
  };
  N.send = function (o) {
    const s = JSON.stringify(o);
    if (open) ws.send(s); else queue.push(s);
  };
  N.close = function () { if (ws) ws.close(); ws = null; open = false; };
  return N;
}
