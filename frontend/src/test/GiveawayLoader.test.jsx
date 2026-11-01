import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import GiveawayLoader, { LOADER_MESSAGES } from '../components/common/GiveawayLoader.jsx';

/** The visible rotating line: last aria-hidden element (orbit, wordmark, label). */
const visibleLabel = (container) => {
  const hidden = container.querySelectorAll('[aria-hidden="true"]');
  return hidden[hidden.length - 1];
};

describe('GiveawayLoader — branded initial giveaway loading', () => {
  it('announces itself as a polite status region with the default label', () => {
    render(<GiveawayLoader />);
    const node = screen.getByRole('status');
    expect(node).toBeInTheDocument();
    expect(node).toHaveTextContent(/Loading giveaways/i);
  });

  it('honours a custom label for a specific draw', () => {
    render(<GiveawayLoader label="Loading iPhone Draw…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading iPhone Draw…');
  });

  it('never renders a generic Bootstrap spinner', () => {
    const { container } = render(<GiveawayLoader />);
    expect(container.querySelector('.spinner-border')).toBeNull();
    expect(container.querySelector('.spinner-grow')).toBeNull();
  });

  it('rotates the themed loader messages slowly (spec §54)', () => {
    vi.useFakeTimers();
    const { container } = render(<GiveawayLoader />);
    expect(visibleLabel(container)).toHaveTextContent(LOADER_MESSAGES[0]);
    act(() => { vi.advanceTimersByTime(2200); });
    expect(visibleLabel(container)).toHaveTextContent(LOADER_MESSAGES[1]);
    // Full cycle wraps back to the first message — and nothing changes faster
    // than 2.2 s (spec: "do not make the messages change too quickly").
    act(() => { vi.advanceTimersByTime(1100); });
    expect(visibleLabel(container)).toHaveTextContent(LOADER_MESSAGES[1]);
    act(() => { vi.advanceTimersByTime(1100 + 2200 * (LOADER_MESSAGES.length - 2)); });
    expect(visibleLabel(container)).toHaveTextContent(LOADER_MESSAGES[0]);
    vi.useRealTimers();
  });

  it('keeps ONE stable screen-reader label while the visible text rotates', () => {
    vi.useFakeTimers();
    const { container } = render(<GiveawayLoader />);
    expect(visibleLabel(container).getAttribute('aria-hidden')).toBe('true');
    const statusText = () => screen.getByRole('status').textContent;
    act(() => { vi.advanceTimersByTime(4400); });
    // Screen readers still receive the stable label, never each rotation.
    expect(screen.getByRole('status')).toHaveTextContent(/Loading giveaways/i);
    expect(statusText()).toContain(LOADER_MESSAGES[2]); // visually advanced
    vi.useRealTimers();
  });

  it('freezes rotation for a custom label (no interval side effects)', () => {
    vi.useFakeTimers();
    render(<GiveawayLoader label="Loading iPhone Draw…" />);
    const label = screen.getByText('Loading iPhone Draw…');
    expect(label.getAttribute('aria-hidden')).toBeNull();
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByText('Loading iPhone Draw…')).toBeInTheDocument(); // never rotates away
    expect(screen.queryByText(LOADER_MESSAGES[0])).toBeNull();
    vi.useRealTimers();
  });
});
