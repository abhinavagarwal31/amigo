import { render, screen } from '@testing-library/react';
import { Landing } from '../src/components/Landing';

describe('Landing', () => {
  test('renders the Amigo heading', () => {
    render(<Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Amigo');
  });

  test('renders a link to /volunteer with correct text', () => {
    render(<Landing />);
    const volunteerLink = screen.getByRole('link', { name: /continue as volunteer/i });
    expect(volunteerLink).toBeInTheDocument();
    expect(volunteerLink).toHaveAttribute('href', '/volunteer');
  });

  test('renders a link to /kiosk with correct text', () => {
    render(<Landing />);
    const kioskLink = screen.getByRole('link', { name: /kiosk mode/i });
    expect(kioskLink).toBeInTheDocument();
    expect(kioskLink).toHaveAttribute('href', '/kiosk');
  });

  test('volunteer link has a unique id for automation', () => {
    render(<Landing />);
    expect(document.getElementById('volunteer-link')).toBeInTheDocument();
  });

  test('kiosk link has a unique id for automation', () => {
    render(<Landing />);
    expect(document.getElementById('kiosk-link')).toBeInTheDocument();
  });

  test('nav landmark is labelled for accessibility', () => {
    render(<Landing />);
    expect(screen.getByRole('navigation', { name: /mode selection/i })).toBeInTheDocument();
  });
});
