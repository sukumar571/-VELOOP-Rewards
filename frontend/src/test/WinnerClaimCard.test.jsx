import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WinnerClaimCard from '../components/giveaway/WinnerClaimCard.jsx';
import { getClaimFields } from '../config/claimFields.js';

vi.mock('../services/claimService.js', () => ({
  submitClaim: vi.fn().mockResolvedValue({ ok: true, status: 'SUBMITTED' }),
}));

const base = {
  giveawayId: 'gv-009',
  giveawaySlug: 'playstation-5',
  giveawayTitle: 'PlayStation 5 Slim',
  prize: 'PS5 Slim console',
  deadline: Date.now() + 7 * 86_400_000,
  isWinner: true,
};

const renderCard = (record) =>
  render(
    <MemoryRouter>
      <WinnerClaimCard record={record} />
    </MemoryRouter>,
  );

describe('WinnerClaimCard', () => {
  it('shows a personalized congrats + claim action for a winning user (physical)', async () => {
    renderCard({
      ...base,
      deliveryMode: 'physical',
      status: 'NOT_SUBMITTED',
      canClaim: true,
      fields: getClaimFields('physical'),
    });
    expect(screen.getByText(/congratulations .*you won/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /claim prize/i }));
    // Accessible modal opens with the physical fulfilment form.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/delivery email/i)).not.toBeInTheDocument();
  });

  it('renders nothing for a non-winner', () => {
    renderCard({ ...base, isWinner: false, canClaim: false, status: null });
    expect(screen.queryByText(/congratulations/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
  });

  it('shows an expired state with no claim action', () => {
    renderCard({
      ...base,
      deliveryMode: 'physical',
      status: 'EXPIRED',
      canClaim: false,
      fields: getClaimFields('physical'),
    });
    expect(screen.getByText(/can no longer be claimed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claim prize/i })).not.toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('offers a gift-card (email-only) claim for a digital prize winner', async () => {
    renderCard({
      ...base,
      giveawaySlug: 'swiggy-gold-voucher',
      giveawayTitle: 'Swiggy Gold Voucher',
      deliveryMode: 'digital',
      status: 'NOT_SUBMITTED',
      canClaim: true,
      fields: getClaimFields('digital'),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /claim gift card/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/delivery email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^address/i)).not.toBeInTheDocument();
  });
});
