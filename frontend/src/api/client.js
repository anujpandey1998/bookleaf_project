// The session JWT is held in an HttpOnly cookie and is never exposed to JavaScript.
const API_ORIGIN = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
export const BASE = `${API_ORIGIN}/api/v1`;

export class ApiError extends Error {
  constructor(message, status, details, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || null;
    this.code = code || null;
  }
}

async function request(path, { method = 'GET', body, params, signal, withMeta = false } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
  }
  const headers = { Accept: 'application/json' };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Network error — is the API server running?', 0, null, 'NETWORK_ERROR');
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    if (response.ok) throw new ApiError('The server returned an invalid response.', response.status, null, 'INVALID_RESPONSE');
  }

  if (response.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event('bookleaf:unauthorized'));
  }
  if (!response.ok) {
    const error = json?.error;
    throw new ApiError(
      error?.message || (response.status >= 500
        ? 'The API server is unavailable. Check that the backend and database are running.'
        : `Request failed (${response.status})`),
      response.status,
      error?.details,
      error?.code,
    );
  }
  if (withMeta) return { data: json?.data ?? json, meta: json?.meta || null };
  return json?.data ?? json;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  signup: (name, email, password) => request('/auth/signup', { method: 'POST', body: { name, email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  authorDashboard: () => request('/author/dashboard'),
  authorBooks: () => request('/author/books'),
  authorTickets: (params) => request('/author/tickets', { params }),
  authorCreateTicket: (payload) => request('/author/tickets', { method: 'POST', body: payload }),
  authorTicketDetail: (id) => request(`/author/tickets/${id}`),
  uploadTicketAttachments: (id, files, role = 'author') => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    return request(`/${role}/tickets/${id}/attachments`, { method: 'POST', body });
  },
  authorSendMessage: (id, bodyText) => request(`/author/tickets/${id}/messages`, { method: 'POST', body: { body: bodyText } }),

  adminDashboard: () => request('/admin/dashboard'),
  adminTickets: (params) => request('/admin/tickets', { params, withMeta: true }),
  adminTicketDetail: (id) => request(`/admin/tickets/${id}`),
  adminUpdateTicket: (id, changes) => request(`/admin/tickets/${id}`, { method: 'PATCH', body: changes }),
  adminAddNote: (id, bodyText) => request(`/admin/tickets/${id}/notes`, { method: 'POST', body: { body: bodyText } }),
  adminGenerateDraft: (id) => request(`/admin/tickets/${id}/ai-draft`, { method: 'POST' }),
  adminSendMessage: (id, bodyText) => request(`/admin/tickets/${id}/messages`, { method: 'POST', body: { body: bodyText } }),
};

export async function downloadTicketAttachment(id) {
  let response;
  try {
    response = await fetch(`${BASE}/ticket-attachments/${id}`, { credentials: 'include' });
  } catch {
    throw new ApiError('Network error — is the API server running?', 0, null, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    if (response.status === 401) window.dispatchEvent(new Event('bookleaf:unauthorized'));
    throw new ApiError(message, response.status);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'attachment';
  return { blob: await response.blob(), filename };
}

export async function streamTicketEvents(id, onEvent, signal) {
  const response = await fetch(`${BASE}/author/tickets/${id}/events`, {
    headers: { Accept: 'text/event-stream' },
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    let message = `Ticket updates unavailable (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch {
      // The status remains useful when the server response is not JSON.
    }
    if (response.status === 401) window.dispatchEvent(new Event('bookleaf:unauthorized'));
    throw new ApiError(message, response.status);
  }
  if (!response.body) throw new ApiError('This browser does not support live ticket updates.', response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const lines = frame.split('\n');
        const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
        const payload = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (payload) onEvent({ event: eventName, data: JSON.parse(payload) });
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
