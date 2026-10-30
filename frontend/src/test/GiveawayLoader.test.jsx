import { render, screen } from '@testing-library/react';
import GiveawayLoader from '../components/common/GiveawayLoader.jsx';

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
});
