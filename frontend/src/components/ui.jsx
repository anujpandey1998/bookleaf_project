// Shared UI primitives: cards, badges, states, forms. Keeps pages small and consistent.
import React from 'react';

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

const STATUS_TONES = { Open: 'blue', 'In Progress': 'amber', Resolved: 'green', Closed: 'gray' };
const PRIORITY_TONES = { Critical: 'red', High: 'orange', Medium: 'yellow', Low: 'green' };

export function StatusBadge({ status }) {
  if (!status) return <span className="badge badge--gray">Unset</span>;
  return <span className={`badge badge--${STATUS_TONES[status] || 'gray'}`}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  if (!priority) return <span className="badge badge--gray">Unset</span>;
  return <span className={`badge badge--${PRIORITY_TONES[priority] || 'gray'}`}>{priority}</span>;
}

export function CategoryBadge({ category, source }) {
  if (!category) return <span className="badge badge--gray">Unclassified</span>;
  return (
    <span className="badge badge--violet" title={source === 'ai' ? 'Classified by AI' : 'Set manually'}>
      {category}{source ? ` · ${source}` : ''}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message || 'Something went wrong.'}</p>
      {onRetry && <button className="btn btn--ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="state state--empty">
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action}
    </div>
  );
}

export function Field({ label, error, hint, required, children }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field-label">
        {label} {required && <abbr title="required">*</abbr>}
      </span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatINR(value) {
  if (value === null || value === undefined) return '—';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export function ConfirmButton({ when, onConfirm, children, ...rest }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      {...rest}
      onClick={() => {
        if (armed || !when) { setArmed(false); onConfirm(); }
        else setArmed(true);
      }}
    >
      {armed ? 'Click again to confirm' : children}
    </button>
  );
}
