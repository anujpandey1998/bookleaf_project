import { useEffect, useRef } from 'react';
import { streamTicketEvents } from '../api/client.js';

function waitForRetry(delay, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export function useTicketEvents(ticketId, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ticketId) return undefined;
    const controller = new AbortController();
    let retryDelay = 1000;

    async function connect() {
      while (!controller.signal.aborted) {
        try {
          await streamTicketEvents(ticketId, (payload) => {
            if (payload.event === 'message') handlersRef.current.onMessage?.(payload.data);
            else if (payload.event === 'status') handlersRef.current.onStatus?.(payload.data);
          }, controller.signal);
          retryDelay = 1000;
        } catch (error) {
          if (controller.signal.aborted) return;
          handlersRef.current.onError?.(error);
        }
        await waitForRetry(retryDelay, controller.signal);
        retryDelay = Math.min(retryDelay * 2, 15000);
      }
    }

    connect();
    return () => controller.abort();
  }, [ticketId]);
}
