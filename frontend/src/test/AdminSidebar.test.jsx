import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminSidebar from '../components/admin/AdminSidebar.jsx';

describe('AdminSidebar navigation items', () => {
  it('renders all 11 required administrative navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminSidebar open={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const expectedNavItems = [
      { label: 'Dashboard Overview', path: '/admin' },
      { label: 'Giveaway Management', path: '/admin/giveaways' },
      { label: 'Prize Management', path: '/admin/prizes' },
      { label: 'Participants', path: '/admin/participants' },
      { label: 'Winner Management', path: '/admin/winners' },
      { label: 'Prize Claims', path: '/admin/claims' },
      { label: 'Transactions', path: '/admin/transactions' },
      { label: 'Fraud Monitoring', path: '/admin/fraud' },
      { label: 'Audit Logs', path: '/admin/audit-logs' },
      { label: 'Reports and Analytics', path: '/admin/reports' },
      { label: 'Admin Settings', path: '/admin/settings' },
    ];

    for (const item of expectedNavItems) {
      const link = screen.getByRole('link', { name: new RegExp(item.label, 'i') });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toBe(item.path);
    }
  });
});
