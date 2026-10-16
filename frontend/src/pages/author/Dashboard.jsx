import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Card, StatCard, Spinner, ErrorState, EmptyState, StatusBadge, PriorityBadge, formatINR, formatDate } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AuthorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.authorDashboard()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const b = data.books;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Welcome, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="muted">Your publishing and royalty snapshot at a glance.</p>
        </div>
        <Link className="btn btn--primary" to="/author/tickets/new">Submit a ticket</Link>
      </header>

      <div className="stat-grid">
        <StatCard label="Total books" value={b.totalBooks} />
        <StatCard label="Published" value={b.publishedBooks} tone="green" />
        <StatCard label="In production" value={b.inProductionBooks} tone="amber" />
        <StatCard label="Copies sold" value={b.totalCopiesSold.toLocaleString('en-IN')} />
        <StatCard label="Royalty earned" value={formatINR(b.totalRoyaltyEarned)} tone="violet" />
        <StatCard label="Royalty paid" value={formatINR(b.royaltyPaid)} tone="green" />
        <StatCard label="Royalty pending" value={formatINR(b.royaltyPending)} tone={b.royaltyPending > 0 ? 'orange' : 'gray'} hint={b.royaltyPending > 0 ? 'Paid within 45 days of quarter-end once above ₹1,000' : undefined} />
      </div>

      <Card title="Support tickets">
        {data.tickets.total === 0 ? (
          <EmptyState
            title="No tickets yet"
            description="Need help with royalties, distribution, printing or metadata? Open your first support ticket."
            action={<Link className="btn btn--primary" to="/author/tickets/new">Submit a ticket</Link>}
          />
        ) : (
          <>
            <div className="stat-grid stat-grid--compact">
              <StatCard label="Open" value={data.tickets.open} tone="blue" />
              <StatCard label="In progress" value={data.tickets.inProgress} tone="amber" />
              <StatCard label="Resolved" value={data.tickets.resolved} tone="green" />
              <StatCard label="Closed" value={data.tickets.closed} tone="gray" />
            </div>
            <TicketPreview />
          </>
        )}
      </Card>
    </div>
  );
}

function TicketPreview() {
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.authorTickets()
      .then((result) => { if (active) setTickets(result.slice(0, 5)); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!tickets.length) return null;
  return (
    <ul className="mini-list">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link to={`/author/tickets/${t.id}`}>
            <span className="mono">{t.reference}</span> {t.subject}
            <StatusBadge status={t.status} /> <PriorityBadge priority={t.priority} />
            <small className="muted"> · updated {formatDate(t.updatedAt)}</small>
          </Link>
        </li>
      ))}
    </ul>
  );
}
