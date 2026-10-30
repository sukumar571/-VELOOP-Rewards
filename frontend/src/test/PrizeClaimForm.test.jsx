import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrizeClaimForm from '../components/giveaway/PrizeClaimForm.jsx';
import { getClaimFields } from '../config/claimFields.js';
import { submitClaim } from '../services/claimService.js';

vi.mock('../services/claimService.js', () => ({
  submitClaim: vi.fn(),
}));

const record = (deliveryMode) => ({
  giveawayId: 'gv-x',
  giveawayTitle: 'Sample Prize',
  deliveryMode,
  deadline: Date.now() + 7 * 86_400_000,
  fields: getClaimFields(deliveryMode),
});

const fillPhysical = async (user) => {
  await user.type(screen.getByLabelText(/full name/i), 'Asha Kumar');
  await user.type(screen.getByLabelText(/phone number/i), '9876543210');
  await user.type(screen.getByLabelText(/^address/i), '12 MG Road');
  await user.type(screen.getByLabelText(/^city/i), 'Pune');
  await user.type(screen.getByLabelText(/^state/i), 'Maharashtra');
  await user.type(screen.getByLabelText(/pin code/i), '411001');
};

beforeEach(() => {
  submitClaim.mockReset();
});

describe('PrizeClaimForm field rendering', () => {
  it('renders physical fulfilment fields and NO delivery email', () => {
    render(<PrizeClaimForm record={record('physical')} />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pin code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/delivery email/i)).not.toBeInTheDocument();
  });

  it('renders ONLY a delivery email for a gift card and NO address', () => {
    render(<PrizeClaimForm record={record('digital')} />);
    expect(screen.getByLabelText(/delivery email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pin code/i)).not.toBeInTheDocument();
  });

  it('shows the claim deadline', () => {
    render(<PrizeClaimForm record={record('digital')} />);
    expect(screen.getByText(/claim deadline:/i)).toBeInTheDocument();
  });
});

describe('PrizeClaimForm submission', () => {
  it('blocks an INVALID form client-side without calling the API', async () => {
    const user = userEvent.setup();
    render(<PrizeClaimForm record={record('physical')} />);
    await user.click(screen.getByRole('button', { name: /submit claim/i }));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    expect(submitClaim).not.toHaveBeenCalled();
  });

  it('calls the API with valid input and shows success', async () => {
    submitClaim.mockResolvedValue({ ok: true, status: 'SUBMITTED' });
    const user = userEvent.setup();
    render(<PrizeClaimForm record={record('physical')} />);
    await fillPhysical(user);
    await user.click(screen.getByRole('button', { name: /submit claim/i }));
    await waitFor(() => expect(submitClaim).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/claim submitted!/i)).toBeInTheDocument();
  });

  it('prevents DUPLICATE submission while a request is in flight', async () => {
    let resolveSubmit;
    submitClaim.mockImplementation(() => new Promise((r) => (resolveSubmit = r)));
    const user = userEvent.setup();
    const { container } = render(<PrizeClaimForm record={record('physical')} />);
    await fillPhysical(user);
    const submitBtn = container.querySelector('button[type="submit"]');
    await user.click(submitBtn);
    expect(submitClaim).toHaveBeenCalledTimes(1);
    expect(submitBtn).toBeDisabled();
    await user.click(submitBtn); // ignored — disabled
    expect(submitClaim).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSubmit({ ok: true, status: 'SUBMITTED' });
    });
    expect(await screen.findByText(/claim submitted!/i)).toBeInTheDocument();
  });

  it('surfaces a retryable server error', async () => {
    submitClaim.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<PrizeClaimForm record={record('physical')} />);
    await fillPhysical(user);
    await user.click(screen.getByRole('button', { name: /submit claim/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
    expect(screen.getByRole('button', { name: /retry submission/i })).toBeInTheDocument();
  });

  it('treats an UNAUTHORIZED response as non-retryable', async () => {
    const err = new Error('You are not authorized to claim this prize.');
    err.code = 'FORBIDDEN';
    submitClaim.mockRejectedValue(err);
    const user = userEvent.setup();
    render(<PrizeClaimForm record={record('physical')} />);
    await fillPhysical(user);
    await user.click(screen.getByRole('button', { name: /submit claim/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not authorized/i);
    expect(
      screen.queryByRole('button', { name: /retry submission/i }),
    ).not.toBeInTheDocument();
  });

  it('renders server VALIDATION errors onto the fields', async () => {
    const err = new Error('Please correct the highlighted fields.');
    err.code = 'VALIDATION';
    err.fields = { pin: 'Enter a valid 6-digit PIN code.' };
    submitClaim.mockRejectedValue(err);
    const user = userEvent.setup();
    render(<PrizeClaimForm record={record('physical')} />);
    // Bypass client validation by using a value the client also rejects? Use valid
    // client values but a server-side field error to prove server mapping.
    await user.type(screen.getByLabelText(/full name/i), 'Asha Kumar');
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');
    await user.type(screen.getByLabelText(/^address/i), '12 MG Road');
    await user.type(screen.getByLabelText(/^city/i), 'Pune');
    await user.type(screen.getByLabelText(/^state/i), 'Maharashtra');
    await user.type(screen.getByLabelText(/pin code/i), '123456'); // client-valid, server rejects
    await user.click(screen.getByRole('button', { name: /submit claim/i }));
    await waitFor(() => expect(submitClaim).toHaveBeenCalled());
    expect(await screen.findByText(/valid 6-digit pin/i)).toBeInTheDocument();
  });
});
