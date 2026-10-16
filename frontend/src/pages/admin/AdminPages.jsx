import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { TicketAttachments } from '../../components/TicketAttachments.jsx';
import {
  Card, CategoryBadge, EmptyState, ErrorState, Field, PriorityBadge, Spinner, StatCard, StatusBadge,
  formatDate, formatDateTime,
} from '../../components/ui.jsx';

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const CATEGORIES = [
  'Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality',
  'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry',
];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

function useRequest(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    return loader().then(
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState({ data: null, loading: false, error: error.message }),
    );
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function AdminDashboard() {
  const { data, loading, error, reload } = useRequest(() => api.adminDashboard());
  if (loading) return <Spinner label="Loading support overview…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const stats = [
    ['All tickets', data.totalTickets, 'default'],
    ['Open', data.openTickets, 'blue'],
    ['In progress', data.inProgressTickets, 'amber'],
    ['Resolved', data.resolvedTickets, 'green'],
    ['Critical / high unresolved', data.criticalHighUnresolved, data.criticalHighUnresolved ? 'red' : 'gray'],
  ];
  return (
    <div className="page">
      <header className="page-head"><div><h1>Support overview</h1><p className="muted">Triage and respond to author requests.</p></div><Link className="btn btn--primary" to="/admin/tickets">Open ticket queue</Link></header>
      <div className="stat-grid">{stats.map(([label, value, tone]) => <StatCard key={label} label={label} value={Number(value).toLocaleString('en-IN')} tone={tone} />)}</div>
      <Card title="Queue by status">
        <div className="status-overview">{[['Open', data.openTickets], ['In Progress', data.inProgressTickets], ['Resolved', data.resolvedTickets], ['Closed', data.closedTickets]].map(([status, value]) => <div className="status-overview__item" key={status}><span>{status}</span><strong>{value}</strong><div className="progress-track"><span style={{ width: `${data.totalTickets ? Math.min(100, value / data.totalTickets * 100) : 0}%` }} /></div></div>)}</div>
        <p className="muted">Prioritize the {data.criticalHighUnresolved} unresolved critical/high ticket(s), including {data.criticalUnresolved} critical.</p>
      </Card>
    </div>
  );
}

export function AdminTicketQueue() {
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', dateFrom: '', dateTo: '', search: '', sort: 'priority_first', page: 1, limit: 20 });
  const [appliedSearch, setAppliedSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const loader = useCallback(() => api.adminTickets({ ...filters, search: appliedSearch }), [filters, appliedSearch, refreshKey]);
  const { data: response, loading, error, reload } = useRequest(loader, [loader]);
  const rows = response?.data || [];
  const meta = response?.meta || { total: 0, page: 1, pages: 1 };

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' ? value : 1,
    }));
  }
  function resetFilters() {
    setFilters({ status: '', category: '', priority: '', dateFrom: '', dateTo: '', search: '', sort: 'priority_first', page: 1, limit: 20 });
    setAppliedSearch('');
  }
  function applySearch(event) {
    event.preventDefault();
    setAppliedSearch(filters.search.trim());
    updateFilter('page', 1);
  }
  return (
    <div className="page">
      <header className="page-head"><div><h1>Ticket queue</h1><p className="muted">{meta.total || 0} matching request(s)</p></div><button className="btn btn--ghost" onClick={() => { setRefreshKey((key) => key + 1); }}>Refresh</button></header>
      <Card title="Filter tickets">
        <form className="filter-grid" onSubmit={applySearch}>
          <Field label="Search"><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Reference, subject, author…" /></Field>
          <Field label="Status"><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Category"><select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Priority"><select value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="From"><input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></Field>
          <Field label="To"><input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></Field>
          <Field label="Sort"><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="priority_first">Priority first · oldest created</option><option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option><option value="created_desc">Newest created</option><option value="created_asc">Oldest created</option><option value="oldest_unresolved">Oldest unresolved</option></select></Field>
          <div className="filter-actions"><button className="btn btn--primary">Apply search</button><button className="btn btn--ghost" type="button" onClick={resetFilters}>Clear</button></div>
        </form>
      </Card>
      <Card>
        {loading ? <Spinner label="Loading ticket queue…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? <EmptyState title="No matching tickets" description="Adjust your filters or check back when new requests arrive." /> : (
          <>
            <div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Author</th><th>Category</th><th>Priority</th><th>Status</th><th>Age</th><th>Assigned to</th><th>Updated</th></tr></thead><tbody>
              {rows.map((ticket) => {
                const ageMs = Math.max(0, Date.now() - new Date(ticket.createdAt).getTime());
                const ageDays = Number.isFinite(ageMs) ? Math.floor(ageMs / 86_400_000) : null;
                const unresolved = ['Open', 'In Progress'].includes(ticket.status);
                const attention = ['Critical', 'High'].includes(ticket.priority) || (unresolved && ageMs > 3 * 86_400_000);
                return <tr key={ticket.id} className={`${attention ? 'ticket-row--attention ' : ''}${ticket.priority === 'Critical' ? 'ticket-row--critical' : ''}`}><td><Link className="table-link" to={`/admin/tickets/${ticket.id}`}><span className="mono">{ticket.reference}</span><strong>{ticket.subject}</strong></Link></td><td>{ticket.authorName}<small className="table-sub">{ticket.authorEmail}</small></td><td><CategoryBadge category={ticket.category} source={ticket.categorySource} /></td><td><PriorityBadge priority={ticket.priority} /></td><td><StatusBadge status={ticket.status} /></td><td>{ageDays === null ? '—' : `${ageDays}d old`}</td><td>{ticket.assignedAdminName || <span className="muted">Unassigned</span>}</td><td>{formatDate(ticket.updatedAt)}</td></tr>;
              })}
            </tbody></table></div>
            <div className="pagination"><span className="muted">Page {meta.page} of {meta.pages} · {meta.total} tickets</span><div><button className="btn btn--ghost" disabled={meta.page <= 1} onClick={() => updateFilter('page', Number(meta.page) - 1)}>Previous</button><button className="btn btn--ghost" disabled={meta.page >= meta.pages} onClick={() => updateFilter('page', Number(meta.page) + 1)}>Next</button></div></div>
          </>
        )}
      </Card>
    </div>
  );
}

export function AdminTicketDetail() {
  const { id } = useParams();
  const { data: ticket, loading, error, reload } = useRequest(() => api.adminTicketDetail(id), [id]);
  const [fields, setFields] = useState({ status: '', category: '', priority: '' });
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [actionError, setActionError] = useState('');
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const autoDraftAttemptedFor = useRef(null);
  const currentTicketId = useRef(null);
  currentTicketId.current = id;

  useEffect(() => {
    if (!ticket) return;
    setFields({ status: ticket.status, category: ticket.category || '', priority: ticket.priority || '' });
    setDraft(ticket.aiDraft || '');
  }, [ticket]);

  useEffect(() => {
    if (!ticket?.id || String(ticket.id) !== String(id) || !ticket.aiConfigured || ticket.aiDraft || autoDraftAttemptedFor.current === String(ticket.id)) return undefined;
    autoDraftAttemptedFor.current = String(ticket.id);
    setBusy('draft');
    setDraftUnavailable(false);
    api.adminGenerateDraft(id).then((result) => {
      if (currentTicketId.current !== ticket.id) return;
      setDraft(result.draft || '');
      setNotice('AI draft generated. Review and save it before sending.');
      reload();
    }).catch(() => {
      if (currentTicketId.current === ticket.id) setDraftUnavailable(true);
    }).finally(() => {
      if (currentTicketId.current === ticket.id) setBusy('');
    });
  }, [id, ticket?.id, ticket?.aiConfigured, ticket?.aiDraft, reload]);

  async function runAction(name, action, successMessage) {
    setBusy(name);
    setActionError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }
  const patch = (changes) => api.adminUpdateTicket(id, changes);
  async function saveClassification(event) {
    event.preventDefault();
    const changes = {};
    if (fields.status !== ticket.status) changes.status = fields.status;
    if ((fields.category || null) !== (ticket.category || null)) changes.category = fields.category;
    if ((fields.priority || null) !== (ticket.priority || null)) changes.priority = fields.priority;
    if (!Object.keys(changes).length) return;
    await runAction('classify', () => patch(changes), 'Ticket updates saved.');
  }
  async function addNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    await runAction('note', async () => { await api.adminAddNote(id, note); setNote(''); }, 'Internal note added.');
  }
  async function generateDraft() {
    setDraftUnavailable(false);
    await runAction('draft', async () => {
      try {
        const result = await api.adminGenerateDraft(id);
        setDraft(result.draft || '');
      } catch (error) {
        setDraftUnavailable(true);
        throw error;
      }
    }, 'AI draft generated. Review and save it before sending.');
  }
  async function saveDraft() {
    await runAction('save-draft', () => patch({ aiDraft: draft.trim() || null }), 'Draft saved. It has not been sent to the author.');
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim() || !window.confirm('Send this reply to the author now?')) return;
    await runAction('send', async () => { await api.adminSendMessage(id, reply); setReply(''); }, 'Reply sent to the author.');
  }
  if (loading) return <Spinner label="Loading ticket details…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const messages = ticket.messages.filter((message) => message.kind !== 'internal_note');
  const notes = ticket.messages.filter((message) => message.kind === 'internal_note');
  const allowedNext = { Open: ['Open', 'In Progress'], 'In Progress': ['In Progress', 'Resolved'], Resolved: ['Resolved', 'In Progress', 'Closed'], Closed: ['Closed'] }[ticket.status];

  return (
    <div className="page page--wide">
      <header className="page-head"><div><Link className="back-link" to="/admin/tickets">← Ticket queue</Link><h1>{ticket.subject}</h1><p className="muted"><span className="mono">{ticket.reference}</span> · submitted {formatDateTime(ticket.createdAt)} · updated {formatDateTime(ticket.updatedAt)}</p></div><StatusBadge status={ticket.status} /></header>
      {actionError && <div className="alert alert--error" role="alert">{actionError}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      <div className="admin-detail-grid">
        <div className="admin-detail-main">
          <Card title="Author request">
            <div className="detail-meta"><CategoryBadge category={ticket.category} source={ticket.categorySource} /><PriorityBadge priority={ticket.priority} />{ticket.book && <span className="badge badge--gray">{ticket.book.title}</span>}</div>
            <p className="preserve-lines request-description">{ticket.description}</p>
            <TicketAttachments ticketId={id} attachments={ticket.attachments} role="admin" onUploaded={reload} />
            <div className="author-summary"><strong>{ticket.author?.name || 'Unknown author'}</strong><span>{ticket.author?.email}</span><span>Author code: {ticket.author?.author_id || '—'}</span></div>
          </Card>
          <Card title="Conversation">
            <div className="message-list">
              {messages.map((message) => <article key={message.id} className={`message ${message.senderRole === 'ADMIN' ? 'message--admin' : 'message--author'}`}><header><strong>{message.senderName || message.senderRole}</strong><time>{formatDateTime(message.createdAt)}</time></header><p className="preserve-lines">{message.body}</p></article>)}
              {!messages.length && <p className="muted">No public replies yet.</p>}
            </div>
            {draft && <button className="btn btn--ghost draft-copy-button" type="button" onClick={() => setReply(draft)}>Use AI draft in reply</button>}
            <form className="form-stack top-rule" onSubmit={sendReply}><Field label="Reply to author" hint="This message is public and will be sent immediately."><textarea rows="4" maxLength="8000" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a clear, empathetic response…" /></Field><div className="form-actions"><button className="btn btn--primary" disabled={busy === 'send' || !reply.trim()}>{busy === 'send' ? 'Sending…' : 'Send reply'}</button></div></form>
          </Card>
          <Card title={`Internal notes (${notes.length})`}>
            <div className="note-list">{notes.map((message) => <article className="internal-note" key={message.id}><header><strong>{message.senderName || 'Admin'}</strong><time>{formatDateTime(message.createdAt)}</time></header><p className="preserve-lines">{message.body}</p></article>)}{!notes.length && <p className="muted">No internal notes.</p>}</div>
            <form className="form-stack top-rule" onSubmit={addNote}><Field label="Add internal note" hint="Visible only to admins; never shown to the author."><textarea rows="3" maxLength="8000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add investigation context for the support team…" /></Field><div className="form-actions"><button className="btn btn--secondary" disabled={busy === 'note' || !note.trim()}>{busy === 'note' ? 'Saving…' : 'Add internal note'}</button></div></form>
          </Card>
          <Card title="Ticket activity">
            <ol className="timeline">{ticket.events.map((event) => <li key={event.id}><strong>{event.event.replaceAll('_', ' ')}</strong><span>{event.actor} · {formatDateTime(event.createdAt)}</span>{event.detail && <small>{JSON.stringify(event.detail)}</small>}</li>)}</ol>
          </Card>
        </div>
        <aside className="admin-detail-side">
          <Card title="Triage and assignment">
            <form className="form-stack" onSubmit={saveClassification}>
              <Field label="Status"><select value={fields.status} onChange={(event) => setFields({ ...fields, status: event.target.value })}>{allowedNext.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Category"><select value={fields.category || ''} onChange={(event) => setFields({ ...fields, category: event.target.value })}><option value="" disabled>Unclassified</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field>
              <Field label="Priority"><select value={fields.priority || ''} onChange={(event) => setFields({ ...fields, priority: event.target.value })}><option value="" disabled>Unset</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></Field>
              <button className="btn btn--primary btn--block" disabled={busy === 'classify'}>{busy === 'classify' ? 'Saving…' : 'Save triage changes'}</button>
            </form>
            <div className="assignment-box"><p><strong>Assigned to:</strong> {ticket.assignedAdmin?.name || 'Unassigned'}</p><button className="btn btn--secondary btn--block" disabled={busy === 'assign'} onClick={() => runAction('assign', () => patch({ assignToMe: true }), 'Ticket assigned to you.')}>{busy === 'assign' ? 'Assigning…' : 'Assign to me'}</button></div>
            {ticket.categoryRationale && <p className="rationale"><strong>Category rationale:</strong> {ticket.categoryRationale}</p>}
            {ticket.priorityRationale && <p className="rationale"><strong>Priority rationale:</strong> {ticket.priorityRationale}</p>}
          </Card>
          <Card title="AI reply draft" actions={<span className={`badge ${ticket.aiProcessingStatus === 'failed' ? 'badge--red' : 'badge--gray'}`}>{ticket.aiProcessingStatus || 'pending'}</span>}>
            <p className="muted">Drafts are never sent automatically. Review, edit and save before choosing “Send reply”.</p>
            {draftUnavailable && <div className="alert alert--warning" role="alert">AI unavailable, write manually. <button className="btn btn--ghost" type="button" disabled={busy === 'draft'} onClick={generateDraft}>Retry AI draft</button></div>}
            {ticket.aiProcessingStatus === 'failed' && <div className="alert alert--warning">Automatic triage is unavailable for this ticket. Review the request and set category and priority manually.</div>}
            {ticket.aiProcessingStatus === 'skipped' && <div className="alert alert--warning">AI triage was skipped when this ticket was submitted. Gemini is now configured: new tickets will be triaged automatically, and you can generate an AI reply draft for this ticket below.</div>}
            <textarea className="draft-editor" rows="12" maxLength="8000" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Generate a draft or write your response manually…" />
            <div className="button-stack"><button className="btn btn--secondary btn--block" disabled={busy === 'draft'} onClick={generateDraft}>{busy === 'draft' ? 'Generating…' : ticket.aiDraft ? 'Regenerate draft' : 'Generate AI draft'}</button><button className="btn btn--ghost btn--block" disabled={busy === 'save-draft'} onClick={saveDraft}>{busy === 'save-draft' ? 'Saving…' : 'Save draft only'}</button></div>
            {ticket.aiDraftGeneratedAt && <small className="muted">Last generated {formatDateTime(ticket.aiDraftGeneratedAt)}{ticket.aiModel ? ` · ${ticket.aiModel}` : ''}</small>}
          </Card>
          {ticket.book && <Card title="Related book"><dl className="book-facts"><dt>Book ID</dt><dd>{ticket.book.bookId}</dd><dt>ISBN</dt><dd>{ticket.book.isbn || 'Pending'}</dd><dt>Status</dt><dd>{ticket.book.status}</dd><dt>Sales / royalty pending</dt><dd>{ticket.book.totalCopiesSold} / ₹{Number(ticket.book.royaltyPending).toLocaleString('en-IN')}</dd></dl></Card>}
        </aside>
      </div>
    </div>
  );
}
