import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminOverviewPage from '../pages/admin/AdminOverviewPage.jsx';
import * as adminService from '../services/adminService.js';

describe('AdminOverviewPage KPI cards', () => {
  it('renders all 8 required KPI metrics with values from backend', async () => {
    vi.spyOn(adminService, 'fetchStats').mockResolvedValue({
      giveaways: 15,
      giveawaysActive: 4,
      giveawaysUpcoming: 2,
      giveawaysCompleted: 9,
      participations: 342,
      totalWinners: 18,
      pendingClaims: 5,
      completedClaims: 13,
      settledTransactions: 80,
    });
    vi.spyOn(adminService, 'fetchGiveaways').mockResolvedValue({ items: [], meta: {} });
    vi.spyOn(adminService, 'fetchAuditTrail').mockResolvedValue({ items: [], meta: {} });
    vi.spyOn(adminService, 'fetchClaimsQueue').mockResolvedValue({ items: [], meta: { total: 5 } });
    vi.spyOn(adminService, 'fetchFraudQueue').mockResolvedValue({ items: [], meta: { total: 0 } });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminOverviewPage />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    // Check all 8 KPI labels
    expect(screen.getByText(/Total Giveaways/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Giveaways/i)).toBeInTheDocument();
    expect(screen.getByText(/Upcoming Giveaways/i)).toBeInTheDocument();
    expect(screen.getByText(/Completed Giveaways/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Participants/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Winners/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pending Prize Claims/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Completed Prize Claims/i)).toBeInTheDocument();

    // Check values
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('342')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
  });
});
