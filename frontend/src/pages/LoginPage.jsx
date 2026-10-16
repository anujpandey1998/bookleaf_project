import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

export default function LoginPage() {
  const { user, login, signup, authError } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/author'} replace />;

  function validate() {
    const e = {};
    if (mode === 'signup' && form.name.trim().length < 2) e.name = 'Enter your name (at least 2 characters).';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (mode === 'signup' && form.password.length < 10) e.password = 'Use at least 10 characters for your password.';
    else if (!form.password) e.password = 'Password is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const u = mode === 'signup'
        ? await signup(form.name.trim(), form.email.trim(), form.password)
        : await login(form.email.trim(), form.password);
      navigate(u.role === 'ADMIN' ? '/admin' : '/author', { replace: true });
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
        <h1>{mode === 'signup' ? 'Create your author account' : 'Sign in'}</h1>
        {(serverError || authError) && <div className="alert alert--error" role="alert">{serverError || authError}</div>}
        <form onSubmit={onSubmit} noValidate>
          {mode === 'signup' && <Field label="Full name" error={errors.name} required>
            <input
              type="text" autoComplete="name" maxLength="150" placeholder="Your name"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>}
          <Field label="Email" error={errors.email} required>
            <input
              type="email" autoComplete="email" placeholder="you@example.com"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Password" error={errors.password} required>
            <input
              type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 10 : undefined} placeholder="••••••••"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : (mode === 'signup' ? 'Create account' : 'Sign in')}
          </button>
        </form>
        <p className="auth-note">
          {mode === 'signup'
            ? 'New accounts are for authors. Admin access is provisioned separately.'
            : 'Use your author or administrator account. New authors can create an account here.'}
        </p>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrors({}); setServerError(''); }}>
          {mode === 'signup' ? 'Already registered? Sign in' : 'New author? Create an account'}
        </button>
      </div>
    </div>
  );
}
