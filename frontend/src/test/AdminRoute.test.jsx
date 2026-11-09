import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminRoute from '../components/admin/AdminRoute.jsx';
import * as AuthContext from '../context/AuthContext.jsx';

describe('AdminRoute security guard', () => {
  it('renders loading state when session is hydrating', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      authenticated: false,
      user: null,
      loading: true,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute>
          <div>Protected Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Verifying administrator privileges/i)).toBeInTheDocument();
  });

  it('renders Access Denied when authenticated as non-admin', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      authenticated: true,
      user: { id: 'usr-123', name: 'Standard User', email: 'user@example.com', roles: ['user'] },
      loading: false,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute>
          <div>Protected Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders protected child component when user has admin role', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      authenticated: true,
      user: { id: 'admin-1', name: 'Ops Admin', email: 'ops.lead@example.com', roles: ['user', 'admin'] },
      loading: false,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute>
          <div>Protected Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
