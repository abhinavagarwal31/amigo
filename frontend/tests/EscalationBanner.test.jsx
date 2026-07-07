import { render, screen } from '@testing-library/react';
import { EscalationBanner } from '../src/components/EscalationBanner';

describe('EscalationBanner', () => {
  test('renders nothing when there is no response yet', () => {
    const { container } = render(<EscalationBanner response={null} outputLanguage="en-US" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the response is not an escalation', () => {
    const { container } = render(
      <EscalationBanner response={{ escalation: false }} outputLanguage="en-US" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders an alert with the reason and action when escalation is true', () => {
    render(
      <EscalationBanner
        response={{
          escalation: true,
          reason: 'matched escalation trigger: "chest pain"',
          action: 'Notify on-site medical/security team immediately.'
        }}
        outputLanguage="en-US"
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/chest pain/);
    expect(alert).toHaveTextContent(/Notify on-site medical/);
  });
});
