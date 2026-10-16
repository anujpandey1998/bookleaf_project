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

export async function insertTicketAttachment({ ticketId, uploadedBy, originalName, storageName, mimeType, sizeBytes }) {
  const result = await query(
    `INSERT INTO ticket_attachments (ticket_id, uploaded_by, original_name, storage_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ticketId, uploadedBy, originalName, storageName, mimeType, sizeBytes],
  );
  return result.insertId;
}

export async function listTicketAttachments(ticketId) {
  return query(
    `SELECT id, ticket_id, original_name, mime_type, size_bytes, created_at
     FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at, id`,
    [ticketId],
  );
}

export async function findTicketAttachment(id) {
  const rows = await query(
    `SELECT a.id, a.ticket_id, a.uploaded_by, a.original_name, a.storage_name, a.mime_type,
       a.size_bytes, t.author_user_id
     FROM ticket_attachments a JOIN tickets t ON t.id = a.ticket_id
     WHERE a.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function deleteTicketAttachments(ids) {
  if (!ids.length) return;
  await query(`DELETE FROM ticket_attachments WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}

export async function listTicketsByAuthor(authorUserId) {
  return query(
    `SELECT ${TICKET_LIST_FIELDS}, b.title AS book_title, b.book_id AS book_code
     FROM tickets t LEFT JOIN books b ON b.id = t.book_id
     WHERE t.author_user_id = ? ORDER BY t.updated_at DESC`,
    [authorUserId],
  );
}

export async function listTicketsAdmin({ status, category, priority, dateFrom, dateTo, search, page = 1, limit = 20, sort = 'priority_first' }) {
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
    priority_first: `FIELD(COALESCE(t.priority,'Low'),'Critical','High','Medium','Low') ASC, t.created_at ASC, t.id ASC`,
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

export async function saveAiClassification(ticketId, classification) {
  await query(
    `UPDATE tickets SET
       category = IF(category_source = 'manual', category, ?),
       category_rationale = IF(category_source = 'manual', category_rationale, ?),
       category_source = IF(category_source = 'manual', category_source, 'ai'),
       priority = IF(priority_source = 'manual', priority, ?),
       priority_rationale = IF(priority_source = 'manual', priority_rationale, ?),
       priority_source = IF(priority_source = 'manual', priority_source, 'ai'),
       ai_processing_status = 'complete',
       ai_model = ?,
       ai_processed_at = ?,
       ai_meta = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      classification.category,
      classification.categoryRationale,
      classification.priority,
      classification.priorityRationale,
      classification.model,
      classification.processedAt,
      classification.meta,
      ticketId,
    ],
  );
}

export async function nextTicketReference() {
  const result = await query('INSERT INTO ticket_reference_sequence () VALUES ()');
  return `BL-TCK-${String(result.insertId).padStart(6, '0')}`;
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

export async function insertMessage({ ticketId, senderUserId, kind, body }) {
  const table = kind === 'public_reply' ? 'ticket_responses' : kind === 'internal_note' ? 'internal_notes' : null;
  if (!table) throw new Error(`Unsupported ticket message kind: ${kind}`);
  const senderColumn = kind === 'public_reply' ? 'sender_user_id' : 'admin_user_id';
  const result = await query(
    `INSERT INTO ${table} (ticket_id, ${senderColumn}, body) VALUES (?, ?, ?)`,
    [ticketId, senderUserId, body],
  );
  return result.insertId;
}

export async function listMessages(ticketId, { authorView = false } = {}) {
  const notesQuery = authorView
    ? ''
    : `UNION ALL
       SELECT n.id, n.ticket_id, n.admin_user_id AS sender_user_id, 'internal_note' AS kind,
              n.body, 0 AS visible_to_author, n.created_at,
              u.name AS sender_name, u.role AS sender_role
       FROM internal_notes n JOIN users u ON u.id = n.admin_user_id
       WHERE n.ticket_id = ?`;
  return query(
    `SELECT * FROM (
       SELECT r.id, r.ticket_id, r.sender_user_id, 'public_reply' AS kind,
              r.body, 1 AS visible_to_author, r.created_at,
              u.name AS sender_name, u.role AS sender_role
       FROM ticket_responses r JOIN users u ON u.id = r.sender_user_id
       WHERE r.ticket_id = ?
       ${notesQuery}
     ) AS ticket_messages
     ORDER BY created_at ASC, id ASC`,
    authorView ? [ticketId] : [ticketId, ticketId],
  );
}

export async function getTicketDraft(ticketId) {
  const rows = await query(
    'SELECT ticket_id, body, model, generated_at FROM ticket_drafts WHERE ticket_id = ? LIMIT 1',
    [ticketId],
  );
  return rows[0] || null;
}

export async function saveTicketDraft({ ticketId, body, model, generatedAt }) {
  await query(
    `INSERT INTO ticket_drafts (ticket_id, body, model, generated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE body=VALUES(body), model=VALUES(model), generated_at=VALUES(generated_at)`,
    [ticketId, body, model, generatedAt],
  );
}

export async function deleteTicketDraft(ticketId) {
  await query('DELETE FROM ticket_drafts WHERE ticket_id = ?', [ticketId]);
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
