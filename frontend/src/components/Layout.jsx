import { useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui.jsx';

function NavItem({ to, icon, children, onNav }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`} onClick={onNav}>
      <span aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </NavLink>
  );
}

export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/author'} replace />;
  }
  return children;
}

export function PortalLayout({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAuthor = role === 'AUTHOR';
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(error.message || 'Could not sign out. Please retry.');
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🍃</span>
          <div>
            <strong>BookLeaf</strong>
            <small>{isAuthor ? 'Author Portal' : 'Admin Portal'}</small>
          </div>
        </div>
        <nav className="nav" aria-label="Portal navigation">
          {isAuthor ? (
            <>
              <NavItem to="/author" icon="📊">Dashboard</NavItem>
              <NavItem to="/author/books" icon="📚">My Books</NavItem>
              <NavItem to="/author/tickets" icon="🎫">My Tickets</NavItem>
              <NavItem to="/author/tickets/new" icon="➕">Submit Ticket</NavItem>
            </>
          ) : (
            <>
              <NavItem to="/admin" icon="📊">Dashboard</NavItem>
              <NavItem to="/admin/tickets" icon="🎫">Ticket Queue</NavItem>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip" title={user?.email}>
            <span className="avatar">{(user?.name || '?')[0]}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role}</small>
            </div>
          </div>
          <button className="btn btn--ghost btn--block" onClick={handleLogout}>Log out</button>
        </div>
      </aside>
      <main className="main">
        {logoutError && <div className="alert alert--error logout-alert" role="alert">{logoutError}</div>}
        <Outlet />
      </main>
    </div>
  );
}
