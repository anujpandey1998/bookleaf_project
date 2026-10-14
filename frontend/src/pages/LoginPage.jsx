import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/author'} replace />;

  function validate() {
    const e = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!form.password) e.password = 'Password is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      navigate(u.role === 'admin' ? '/admin' : '/author', { replace: true });
    } catch (err) {
      setServerError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand brand--center">
          <span className="brand-mark">🍃</span>
          <div>
            <strong>BookLeaf Publishing</strong>
            <small>Author Support & Communication Portal</small>
          </div>
        </div>
        <h1>Sign in</h1>
        {serverError && <div className="alert alert--error" role="alert">{serverError}</div>}
        <form onSubmit={onSubmit} noValidate>
          <Field label="Email" error={errors.email} required>
            <input
              type="email" autoComplete="email" placeholder="you@example.com"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Password" error={errors.password} required>
            <input
              type="password" autoComplete="current-password" placeholder="••••••••"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-note">Demo accounts are provided in the README. Admin access is provisioned by the seed script only.</p>
      </div>
    </div>
  );
}
