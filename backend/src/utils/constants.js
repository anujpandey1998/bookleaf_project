export const TICKET_CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];

export const TICKET_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

// Documented status lifecycle:
// Open -> In Progress
// In Progress -> Resolved
// Resolved -> Closed | In Progress (reopen when the author replies)
// Closed -> (terminal)
export const STATUS_TRANSITIONS = {
  Open: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: ['In Progress', 'Closed'],
  Closed: [],
};

export function isValidTransition(from, to) {
  if (from === to) return true; // no-op allowed
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

export const ROLES = { AUTHOR: 'AUTHOR', ADMIN: 'ADMIN' };
