// Server-Sent Events hub: tracks connected author clients per ticket and broadcasts updates.
// Authors receive only author-safe payloads (internal notes are filtered upstream in controllers).

const subscribers = new Map(); // ticketId -> Set of { res, userId, role }

export function addSubscriber(ticketId, userId, role, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const entry = { res, userId, role };
  if (!subscribers.has(ticketId)) subscribers.set(ticketId, new Set());
  subscribers.get(ticketId).add(entry);

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25000);

  res.on('close', () => {
    clearInterval(keepAlive);
    const set = subscribers.get(ticketId);
    if (set) {
      set.delete(entry);
      if (!set.size) subscribers.delete(ticketId);
    }
  });
}

// event names: 'message' | 'status' | 'ticket_updated'
export function broadcast(ticketId, event, data, { authorSafe = true } = {}) {
  const set = subscribers.get(Number(ticketId));
  if (!set) return;
  for (const sub of set) {
    if (authorSafe && sub.role === 'admin') continue; // admin UI uses polling/refresh on detail pages
    try {
      sub.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      set.delete(sub);
    }
  }
}
