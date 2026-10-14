import { query } from '../config/db.js';

const TICKET_LIST_FIELDS = `t.id, t.reference, t.author_user_id, t.book_id, t.subject, t.description,
  t.attachment_name, t.category, t.category_source, t.priority, t.priority_source, t.status,
  t.assigned_admin_id, t.ai_processing_status, t.created_at, t.updated_at`;

export async function insertTicket({ reference, authorUserId, bookId, subject, description, attachmentName }) {
  const result = await query(
    `INSERT INTO tickets (reference, author_user_id, book_id, subject, description, attachment_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reference, authorUserId, bookId ?? null, subject, description, attachmentName ?? null],
  );
  return result.insertId;
}

export async function findTicketById(id) {
  const rows = await query(`SELECT * FROM tickets WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function listTicketsByAuthor(authorUserId) {
  return query(
    `SELECT ${TICKET_LIST_FIELDS}, b.title AS book_title, b.book_id AS book_code
     FROM tickets t LEFT JOIN books b ON b.id = t.book_id
     WHERE t.author_user_id = ? ORDER BY t.updated_at DESC`,
    [authorUserId],
  );
}

export async function listTicketsAdmin({ status, category, priority, dateFrom, dateTo, search, page = 1, limit = 20, sort = 'updated_desc' }) {
  const where = [];
  const params = [];
  if (status) { where.push('t.status = ?'); params.push(status); }
  if (category) { where.push('t.category = ?'); params.push(category); }
  if (priority) { where.push('t.priority = ?'); params.push(priority); }
  if (dateFrom) { where.push('t.created_at >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { where.push('t.created_at <= ?'); params.push(new Date(`${dateTo}T23:59:59`)); }
  if (search) {
    where.push('(t.subject LIKE ? OR t.reference LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sorts = {
    updated_desc: 't.updated_at DESC',
    updated_asc: 't.updated_at ASC',
    created_desc: 't.created_at DESC',
    created_asc: 't.created_at ASC',
    oldest_unresolved: `FIELD(t.status,'Open','In Progress','Resolved','Closed') ASC, t.created_at ASC`,
    priority_first: `FIELD(t.priority,'Critical','High','Medium','Low') ASC, t.updated_at DESC`,
  };
  const orderSql = sorts[sort] || sorts.updated_desc;

  const offset = (Number(page) - 1) * Number(limit);
  const rows = await query(
    `SELECT ${TICKET_LIST_FIELDS},
            u.name AS author_name, u.email AS author_email,
            b.title AS book_title, b.book_id AS book_code,
            ad.name AS assigned_admin_name
     FROM tickets t
     JOIN users u ON u.id = t.author_user_id
     LEFT JOIN books b ON b.id = t.book_id
     LEFT JOIN users ad ON ad.id = t.assigned_admin_id
     ${whereSql} ORDER BY ${orderSql} LIMIT ${Number(limit)} OFFSET ${offset}`,
    params,
  );
  const countRows = await query(
    `SELECT COUNT(*) AS total FROM tickets t JOIN users u ON u.id = t.author_user_id ${whereSql}`,
    params,
  );
  return { rows, total: Number(countRows[0].total), page: Number(page), limit: Number(limit) };
}

export async function updateTicketFields(id, fields) {
  if (!Object.keys(fields).length) return;
  const keys = Object.keys(fields);
  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  await query(`UPDATE tickets SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    ...Object.values(fields),
    id,
  ]);
}

export async function nextTicketReference() {
  const rows = await query('SELECT COUNT(*) AS c FROM tickets');
  const n = Number(rows[0].c) + 1;
  return `BL-TCK-${String(n).padStart(6, '0')}`;
}

export async function getAdminTicketStats() {
  const rows = await query(
    `SELECT COUNT(*) AS total,
            SUM(status='Open') AS open,
            SUM(status='In Progress') AS in_progress,
            SUM(status='Resolved') AS resolved,
            SUM(status='Closed') AS closed,
            SUM(priority IN ('Critical','High') AND status NOT IN ('Resolved','Closed')) AS critical_high_open,
            SUM(priority='Critical' AND status NOT IN ('Resolved','Closed')) AS critical_open
     FROM tickets`,
  );
  return rows[0];
}

// ---- messages ----
export async function insertMessage({ ticketId, senderUserId, kind, body }) {
  const visible = kind === 'public_reply' ? 1 : 0;
  const result = await query(
    `INSERT INTO messages (ticket_id, sender_user_id, kind, body, visible_to_author)
     VALUES (?, ?, ?, ?, ?)`,
    [ticketId, senderUserId, kind, body, visible],
  );
  return result.insertId;
}

export async function listMessages(ticketId, { authorView = false } = {}) {
  const visibility = authorView ? 'AND m.visible_to_author = 1' : '';
  return query(
    `SELECT m.id, m.ticket_id, m.sender_user_id, m.kind, m.body, m.created_at,
            u.name AS sender_name, u.role AS sender_role
     FROM messages m JOIN users u ON u.id = m.sender_user_id
     WHERE m.ticket_id = ? ${visibility} ORDER BY m.created_at ASC, m.id ASC`,
    [ticketId],
  );
}

// ---- events (audit trail) ----
export async function insertTicketEvent({ ticketId, actorUserId, event, detail }) {
  await query(
    `INSERT INTO ticket_events (ticket_id, actor_user_id, event, detail) VALUES (?, ?, ?, ?)`,
    [ticketId, actorUserId ?? null, event, detail ? JSON.stringify(detail) : null],
  );
}

export async function listTicketEvents(ticketId) {
  return query(
    `SELECT e.id, e.event, e.detail, e.created_at, u.name AS actor_name
     FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.ticket_id = ? ORDER BY e.created_at ASC, e.id ASC`,
    [ticketId],
  );
}
