// Central API client. Uses Vite proxy (/api) in dev and VITE_API_BASE in production builds.
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api';
const TOKEN_KEY = 'bookleaf_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

async function request(path, { method = 'GET', body, params, signal } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Network error — is the API server running?', 0);
  }

  // Expired/invalid token → clear session (login page will re-render).
  if (res.status === 401 && getToken() && !path.startsWith('/auth/login')) {
    setToken(null);
    window.dispatchEvent(new Event('bookleaf:unauthorized'));
  }

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.error?.details);
  }
  return json?.data ?? json;
}

export const api = {
  // auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  // author
  authorDashboard: () => request('/author/dashboard'),
  authorBooks: () => request('/author/books'),
  authorTickets: () => request('/author/tickets'),
  authorCreateTicket: (payload) => request('/author/tickets', { method: 'POST', body: payload }),
  authorTicketDetail: (id) => request(`/author/tickets/${id}`),

  // admin
  adminDashboard: () => request('/admin/dashboard'),
  adminTickets: (params) => request('/admin/tickets', { params }),
  adminTicketDetail: (id) => request(`/admin/tickets/${id}`),
  adminUpdateTicket: (id, changes) => request(`/admin/tickets/${id}`, { method: 'PATCH', body: changes }),
  adminAddNote: (id, bodyText) => request(`/admin/tickets/${id}/notes`, { method: 'POST', body: { body: bodyText } }),
  adminGenerateDraft: (id) => request(`/admin/tickets/${id}/ai-draft`, { method: 'POST' }),
  adminSendMessage: (id, bodyText) => request(`/admin/tickets/${id}/messages`, { method: 'POST', body: { body: bodyText } }),

  sseUrl: (id) => `${BASE}/author/tickets/${id}/events?token=${encodeURIComponent(getToken() || '')}`,
};

export { ApiError, BASE };
