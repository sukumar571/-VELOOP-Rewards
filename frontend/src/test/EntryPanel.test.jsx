import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EntryPanel from '../components/giveaway/EntryPanel.jsx';
import { formatAmount } from '../config/currencies.js';

vi.mock('../services/giveawayService.js', () => ({
  getEntryState: vi.fn(),
  joinGiveaway: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ authenticated: true, refresh: vi.fn() }),
}));

// Re-mocked per scenario; EntryPanel renders entirely from this object.
import { getEntryState } from '../services/giveawayService.js';

const feeLabel = formatAmount('VE', 250); // e.g. "250 VEs" — single source of truth

const state = (over) => ({
  authenticated: true,
  status: 'active',
  entry: { currency: 'VE', amount: 250 },
  fee: 250,
  balance: 850,
  eligible: true,
  hasJoined: false,
  sufficient: true,
  projectedAfter: 600,
  ...over,
});

const renderPanel = () =>
  render(
    <MemoryRouter>
      <EntryPanel
        giveaway={{
          id: 'gw-1',
          title: 'Summer iPhone Giveaway',
          startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        }}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  getEntryState.mockReset();
});

describe('EntryPanel — spec §17 participation CTA state matrix', () => {
  it('signed out → "Login to Participate"', async () => {
    getEntryState.mockResolvedValue(state({ authenticated: false, balance: null }));
    renderPanel();
    expect(await screen.findByRole('button', { name: /login to participate/i })).toBeInTheDocument();
  });

  it('upcoming → "Notify Me" toggles a demo-only confirmation (frontend state, §17)', async () => {
    getEntryState.mockResolvedValue(state({ status: 'upcoming' }));
    renderPanel();
    const btn = await screen.findByRole('button', { name: /notify me/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(screen.getByRole('button', { name: /notify me/i })).toHaveAttribute('aria-pressed', 'true');
    // Honest note — no notification channel is connected (spec §63).
    expect(await screen.findByText(/not yet connected/i)).toBeInTheDocument();
  });

  it('ended → "View Winners" link', async () => {
    getEntryState.mockResolvedValue(state({ status: 'ended' }));
    renderPanel();
    const link = await screen.findByRole('link', { name: /view winners/i });
    expect(link).toHaveAttribute('href', '/winners');
  });

  it('logged in, already joined → "You\'re Participating ✓" (disabled)', async () => {
    getEntryState.mockResolvedValue(state({ hasJoined: true }));
    renderPanel();
    const btn = await screen.findByRole('button', { name: /you're participating/i });
    expect(btn).toBeDisabled();
  });

  it('sufficient balance → cost is on the button itself (§86: "Join for 250 VEs")', async () => {
    getEntryState.mockResolvedValue(state());
    renderPanel();
    expect(await screen.findByRole('button', { name: `Join for ${feeLabel}` })).toBeEnabled();
  });

  it('insufficient balance → CTA becomes "Earn More VEs →" and shows the shortfall (§88)', async () => {
    getEntryState.mockResolvedValue(state({ balance: 120, sufficient: false, projectedAfter: -130 }));
    renderPanel();
    const link = await screen.findByRole('link', { name: /earn more ves/i });
    expect(link).toHaveAttribute('href', '/earn');
    expect(screen.getByText(/you need 130 more ves to participate/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join for/i })).not.toBeInTheDocument();
  });

  it('ineligible → join stays blocked (behavior preserved)', async () => {
    getEntryState.mockResolvedValue(state({ eligible: false }));
    renderPanel();
    const btn = await screen.findByRole('button', { name: /not eligible/i });
    expect(btn).toBeDisabled();
  });

  it('unknown balance → never implies joinability (behavior preserved)', async () => {
    getEntryState.mockResolvedValue(state({ balance: null, sufficient: false, projectedAfter: null }));
    renderPanel();
    const btn = await screen.findByRole('button', { name: /balance unavailable/i });
    expect(btn).toBeDisabled();
  });
});
