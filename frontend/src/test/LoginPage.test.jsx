/**
 * LoginPage — the demo register → sign-in journey.
 * Auth + router are mocked so the assertions are about the page's own logic:
 * validation, the local account gate, and that a successful credential check
 * hands the registered profile to login() and returns the visitor to `from`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../pages/LoginPage.jsx';
import { registerAccount, clearAccounts } from '../services/demoAuth.js';

const { loginMock, setEligibleMock, navigateMock } = vi.hoisted(() => ({
  loginMock: vi.fn(async (p) => p),
  setEligibleMock: vi.fn(async () => {}),
  navigateMock: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, authenticated: false, login: loginMock, setEligible: setEligibleMock }),
}));

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: { from: '/giveaways/summer' }, pathname: '/login' }),
  };
});

const submitButton = (container) => container.querySelector('form button[type="submit"]');

beforeEach(() => {
  clearAccounts();
  loginMock.mockClear();
  setEligibleMock.mockClear();
  navigateMock.mockClear();
});

describe('LoginPage — create account', () => {
  it('registers a demo account, signs in with its profile and redirects', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: /create account/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Asha Kumar');
    await user.type(screen.getByLabelText(/email address/i), 'Asha@Example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret1');
    await user.type(screen.getByLabelText(/confirm password/i), 'secret1');

    await user.click(submitButton(container));

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(loginMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Asha Kumar', email: 'asha@example.com' }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/giveaways/summer', { replace: true });
  });

  it('blocks a submit whose passwords do not match (no login attempted)', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: /create account/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Asha Kumar');
    await user.type(screen.getByLabelText(/email address/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret1');
    await user.type(screen.getByLabelText(/confirm password/i), 'different');
    await user.click(submitButton(container));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});

describe('LoginPage — sign in', () => {
  it('refuses to sign in when no demo account exists on this device', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret1');
    await user.click(submitButton(container));

    expect(await screen.findByText(/no demo account found/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('signs in with the details used at registration', async () => {
    registerAccount({ name: 'Asha Kumar', email: 'asha@example.com', password: 'secret1' });
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret1');
    await user.click(submitButton(container));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'asha@example.com' }),
    ));
    expect(navigateMock).toHaveBeenCalledWith('/giveaways/summer', { replace: true });
  });

  it('surfaces a generic error for wrong credentials', async () => {
    registerAccount({ name: 'Asha Kumar', email: 'asha@example.com', password: 'secret1' });
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrongpass');
    await user.click(submitButton(container));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});
