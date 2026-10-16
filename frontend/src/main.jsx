import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { PortalLayout, ProtectedRoute } from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AuthorDashboard from './pages/author/Dashboard.jsx';
import { AuthorBooks, AuthorTicketDetail, AuthorTickets, NewAuthorTicket } from './pages/author/AuthorPages.jsx';
import { AdminDashboard, AdminTicketDetail, AdminTicketQueue } from './pages/admin/AdminPages.jsx';
import './styles.css';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/author" element={<ProtectedRoute role="AUTHOR"><PortalLayout role="AUTHOR" /></ProtectedRoute>}>
            <Route index element={<AuthorDashboard />} />
            <Route path="books" element={<AuthorBooks />} />
            <Route path="tickets" element={<AuthorTickets />} />
            <Route path="tickets/new" element={<NewAuthorTicket />} />
            <Route path="tickets/:id" element={<AuthorTicketDetail />} />
          </Route>
          <Route path="/admin" element={<ProtectedRoute role="ADMIN"><PortalLayout role="ADMIN" /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="tickets" element={<AdminTicketQueue />} />
            <Route path="tickets/:id" element={<AdminTicketDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
