import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { TicketAttachments } from '../../components/TicketAttachments.jsx';
import { useTicketEvents } from '../../hooks/useTicketEvents.js';
import {
  Card, CategoryBadge, EmptyState, ErrorState, Field, PriorityBadge, Spinner, StatusBadge,
  formatDate, formatDateTime, formatINR,
} from '../../components/ui.jsx';

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    return loader().then(
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState({ data: null, loading: false, error: error.message }),
    );
  }, deps); // loader dependencies are supplied by each page
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function AuthorBooks() {
  const { data: books, loading, error, reload } = useLoad(() => api.authorBooks());
  if (loading) return <Spinner label="Loading your books…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="page">
      <header className="page-head"><div><h1>My books</h1><p className="muted">Titles, publication status and royalty summary.</p></div></header>
      <Card>
        {!books.length ? <EmptyState title="No books found" description="Your published and in-production titles will appear here." /> : (
          <div className="table-wrap"><table><thead><tr><th>Title</th><th>Book ID / ISBN</th><th>Publication date</th><th>Status</th><th>Copies sold</th><th>Earned</th><th>Paid</th><th>Pending</th><th>Platforms</th></tr></thead>
            <tbody>{books.map((book) => <tr key={book.id}>
              <td><strong>{book.title}</strong><small className="table-sub">{book.genre || 'Genre not set'} · MRP {formatINR(book.mrp)}</small></td>
              <td><span className="mono">{book.bookId}</span><small className="table-sub">{book.isbn || 'ISBN pending'}</small></td>
              <td>{book.publicationDate ? formatDate(book.publicationDate) : '-'}</td>
              <td><span className={`badge ${book.isPublished ? 'badge--green' : 'badge--amber'}`}>{book.status}</span></td>
              <td>{Number(book.totalCopiesSold || 0).toLocaleString('en-IN')}</td><td>{formatINR(book.totalRoyaltyEarned)}</td><td>{formatINR(book.royaltyPaid)}</td>
              <td>{formatINR(book.royaltyPending)}
                {Number(book.royaltyPending) > 0 && Number(book.royaltyPending) < 1000 && <small className="table-sub">Below the Rs 1,000 minimum payout; rolls over to next quarter</small>}
              </td>
              <td>{book.availableOn?.length ? book.availableOn.join(', ') : '—'}</td>
            </tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

export function AuthorTickets() {
  const { data: tickets, loading, error, reload } = useLoad(() => api.authorTickets());
  if (loading) return <Spinner label="Loading your tickets…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="page">
      <header className="page-head"><div><h1>My support tickets</h1><p className="muted">Follow updates and reply to the BookLeaf support team.</p></div><Link className="btn btn--primary" to="/author/tickets/new">New ticket</Link></header>
      <Card>
        {!tickets.length ? <EmptyState title="No tickets yet" description="Create a ticket and the support team will follow up here." action={<Link className="btn btn--primary" to="/author/tickets/new">Submit a ticket</Link>} /> : (
          <div className="table-wrap"><table><thead><tr><th>Reference / subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Last updated</th></tr></thead><tbody>
            {tickets.map((ticket) => <tr key={ticket.id}><td><Link className="table-link" to={`/author/tickets/${ticket.id}`}><span className="mono">{ticket.reference}</span><strong>{ticket.subject}</strong></Link></td><td><CategoryBadge category={ticket.category} /></td><td><PriorityBadge priority={ticket.priority} /></td><td><StatusBadge status={ticket.status} /></td><td>{formatDate(ticket.updatedAt)}</td></tr>)}
          </tbody></table></div>
        )}
      </Card>
    </div>
  );
}

export function NewAuthorTicket() {
  const navigate = useNavigate();
  const { data: books, loading: booksLoading, error: booksError } = useLoad(() => api.authorBooks());
  const [form, setForm] = useState({ bookId: '', subject: '', description: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (files.length > 5 || files.some((file) => file.size > 25 * 1024 * 1024)) {
        throw new Error('Choose up to 5 files, each no larger than 25 MB.');
      }
      const ticket = await api.authorCreateTicket({
        ...form,
        bookId: form.bookId ? Number(form.bookId) : null,
      });
      let notice = `Ticket ${ticket.reference} was submitted.`;
      if (files.length) {
        try {
          await api.uploadTicketAttachments(ticket.id, files);
          notice += ' Attachments uploaded.';
        } catch (uploadError) {
          notice += ` Attachments were not uploaded: ${uploadError.message} You can retry on this page.`;
        }
      }
      navigate(`/author/tickets/${ticket.id}`, { replace: true, state: { notice } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page--narrow">
      <header className="page-head"><div><Link className="back-link" to="/author/tickets">← My tickets</Link><h1>Submit a support ticket</h1><p className="muted">Share enough detail for our team to investigate.</p></div></header>
      <Card>
        {booksError && <div className="alert alert--error" role="alert">{booksError}</div>}
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={submit}>
          <Field label="Related book" hint="Choose General / account level if this is not about one title.">
            <select value={form.bookId} onChange={(event) => setForm({ ...form, bookId: event.target.value })} disabled={booksLoading}>
              <option value="">General / account level</option>
              {(books || []).map((book) => <option key={book.id} value={book.id}>{book.title} ({book.bookId})</option>)}
            </select>
          </Field>
          <Field label="Subject" required><input required minLength="3" maxLength="200" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Briefly describe the issue" /></Field>
          <Field label="Description" required hint="Do not include passwords, bank account numbers, or other sensitive credentials.">
            <textarea required minLength="10" maxLength="8000" rows="7" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What happened, when did you notice it, and what outcome do you need?" />
          </Field>
          <Field label="Attach files (optional)" hint="PDF, JPG, PNG, GIF, WEBP, MP4, or WEBM · up to 5 files, 25 MB each.">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          </Field>
          {files.length > 0 && <p className="muted">{files.map((file) => file.name).join(', ')}</p>}
          <div className="form-actions"><Link className="btn btn--ghost" to="/author/tickets">Cancel</Link><button className="btn btn--primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit ticket'}</button></div>
        </form>
      </Card>
    </div>
  );
}

export function AuthorTicketDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data: ticket, loading, error, reload } = useLoad(() => api.authorTicketDetail(id), [id]);
  const [reply, setReply] = useState('');
  const [sendError, setSendError] = useState('');
  const [busy, setBusy] = useState(false);
  const [eventVersion, setEventVersion] = useState(0);
  useTicketEvents(id, {
    onMessage: () => setEventVersion((version) => version + 1),
    onStatus: () => setEventVersion((version) => version + 1),
    onError: (streamError) => { if (streamError.status === 401) setSendError('Your session has expired. Please sign in again.'); },
  });
  useEffect(() => { if (eventVersion) reload(); }, [eventVersion, reload]);
  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setSendError('');
    try {
      await api.authorSendMessage(id, reply);
      setReply('');
      await reload();
    } catch (err) {
      setSendError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner label="Loading ticket…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="page page--narrow">
      {location.state?.notice && <div className="alert alert--success" role="status">{location.state.notice}</div>}
      <header className="page-head"><div><Link className="back-link" to="/author/tickets">← My tickets</Link><h1>{ticket.subject}</h1><p className="muted"><span className="mono">{ticket.reference}</span> · submitted {formatDate(ticket.createdAt)}</p></div><StatusBadge status={ticket.status} /></header>
      <div className="detail-meta"><CategoryBadge category={ticket.category} /><PriorityBadge priority={ticket.priority} />{ticket.bookTitle && <span className="badge badge--gray">{ticket.bookTitle}</span>}</div>
      <Card title="Conversation">
        <div className="message-list">
          <article className="message message--author"><header><strong>Your request</strong><time>{formatDateTime(ticket.createdAt)}</time></header><p className="preserve-lines">{ticket.description}</p>{ticket.attachmentName && <small className="muted">Attachment noted: {ticket.attachmentName}</small>}</article>
          {ticket.messages.map((message) => <article key={message.id} className={`message ${message.senderRole === 'AUTHOR' ? 'message--author' : ''}`}><header><strong>{message.senderName || (message.senderRole === 'ADMIN' ? 'BookLeaf Support' : 'You')}</strong><time>{formatDateTime(message.createdAt)}</time></header><p className="preserve-lines">{message.body}</p></article>)}
          {ticket.messages.length === 0 && <p className="muted">The support team has not replied yet. Updates will appear here.</p>}
        </div>
      </Card>
      <Card><TicketAttachments ticketId={id} attachments={ticket.attachments} onUploaded={reload} /></Card>
      {ticket.status !== 'Closed' && <Card title="Send a reply">
        {sendError && <div className="alert alert--error" role="alert">{sendError}</div>}
        <form className="form-stack" onSubmit={send}><Field label="Message" required><textarea required minLength="1" maxLength="8000" rows="4" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Add information or reply to the support team…" /></Field><div className="form-actions"><button className="btn btn--primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></div></form>
      </Card>}
      {ticket.status === 'Closed' && <p className="muted">This ticket is closed. If you need further help, please open a new ticket.</p>}
    </div>
  );
}
