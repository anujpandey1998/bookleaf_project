import { useEffect, useRef } from 'react';
import { api } from '../api/client.js';

// Subscribe to a ticket's SSE stream (new replies / status changes) without manual refresh.
// Falls back silently: if SSE fails, callers can still poll.
export function useTicketEvents(ticketId, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ticketId) return undefined;
    let source;
    try {
      source = new EventSource(api.sseUrl(ticketId));
    } catch {
      return undefined;
    }
    source.addEventListener('message', (e) => {
      try { handlersRef.current.onMessage?.(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    });
    source.addEventListener('status', (e) => {
      try { handlersRef.current.onStatus?.(JSON.parse(e.data)); } catch { /* ignore */ }
    });
    source.onerror = () => { /* EventSource auto-reconnects; no-op keeps console clean */ };
    return () => source.close();
  }, [ticketId]);
}
