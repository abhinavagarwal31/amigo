import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { KioskView, resolveKioskVenueId } from '../src/components/KioskView';
import { VENUES } from '../src/constants';

class FakeSpeechRecognition {
  constructor() {
    FakeSpeechRecognition.instances.push(this);
    this.lang = '';
    this.start = jest.fn();
    this.stop = jest.fn(() => {
      if (this.onend) this.onend();
    });
  }
}
FakeSpeechRecognition.instances = [];

function mockFetchOnce(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
}

function hangingFetchRespectingAbort() {
  return jest.fn(
    (url, options) =>
      new Promise((resolve, reject) => {
        if (options && options.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        }
      })
  );
}

describe('resolveKioskVenueId', () => {
  afterEach(() => {
    delete global.__KIOSK_VENUE_ID__;
  });

  test('falls back to the first known venue when no override is configured', () => {
    expect(resolveKioskVenueId()).toBe(VENUES[0].id);
  });

  test('uses the configured venue when it matches a known venue id', () => {
    global.__KIOSK_VENUE_ID__ = VENUES[1].id;
    expect(resolveKioskVenueId()).toBe(VENUES[1].id);
  });

  test('falls back to the first known venue when the configured id is invalid', () => {
    global.__KIOSK_VENUE_ID__ = 'not_a_real_venue';
    expect(resolveKioskVenueId()).toBe(VENUES[0].id);
  });
});

describe('KioskView', () => {
  beforeEach(() => {
    FakeSpeechRecognition.instances = [];
    window.SpeechRecognition = FakeSpeechRecognition;
  });

  afterEach(() => {
    delete window.SpeechRecognition;
    delete global.fetch;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('starts in the IDLE state showing language selection', () => {
    render(<KioskView />);
    expect(screen.getByText(/select your language/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Español' })).toBeInTheDocument();
  });

  test('selecting a language transitions IDLE -> LISTENING', () => {
    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText(/ask your question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tap to speak/i })).toBeInTheDocument();
  });

  test('provides a keyboard/text fallback in LISTENING so voice is never required', async () => {
    mockFetchOnce(200, {
      answer: 'Gate A is open.',
      category: 'GROUNDED_FACT',
      confidence: 'high',
      escalation: false,
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    const input = screen.getByLabelText(/or type your question/i);
    fireEvent.change(input, { target: { value: 'is gate a open' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Gate A is open/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({ body: expect.stringContaining('is gate a open') })
    );
  });

  test('shows an error state instead of hanging forever when the query request times out', async () => {
    jest.useFakeTimers();
    global.fetch = hangingFetchRespectingAbort();

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    const input = screen.getByLabelText(/or type your question/i);
    fireEvent.change(input, { target: { value: 'is gate a open' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    });

    expect(screen.getByRole('status')).toHaveTextContent(/finding your answer/i);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });

  test('tapping the mic transitions LISTENING -> PROCESSING -> RESPONDING with a grounded answer', async () => {
    mockFetchOnce(200, {
      answer: 'The nearest accessible restroom is at Section 214 concourse.',
      category: 'GROUNDED_FACT',
      confidence: 'high',
      escalation: false,
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /tap to speak/i }));

    const instance = FakeSpeechRecognition.instances[0];
    expect(instance.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      instance.onresult({ results: [[{ transcript: 'where is the restroom' }]] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Section 214 concourse/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /ask another question/i })).toBeInTheDocument();
  });

  test('renders kiosk-specific escalation content distinct from volunteer-facing copy', async () => {
    mockFetchOnce(200, {
      answer: null,
      category: 'ESCALATE',
      confidence: 'high',
      escalation: true,
      reason: 'matched escalation trigger: "chest pain"',
      action: 'Notify on-site medical/security team immediately. Do not attempt to resolve via chat.',
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /tap to speak/i }));

    const instance = FakeSpeechRecognition.instances[0];
    await act(async () => {
      instance.onresult({ results: [[{ transcript: 'my friend has chest pain' }]] });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /alert nearby staff/i })).toBeInTheDocument();
    });

    // Kiosk-specific fan-facing copy is present...
    expect(screen.getByText(/this may need urgent help/i)).toBeInTheDocument();
    // ...but the raw volunteer-facing backend text is not reused verbatim for the fan.
    expect(screen.queryByText(/do not attempt to resolve via chat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/matched escalation trigger/i)).not.toBeInTheDocument();
  });

  test('renders the escalation screen right-to-left when Arabic is the selected language', async () => {
    mockFetchOnce(200, {
      answer: null,
      category: 'ESCALATE',
      confidence: 'high',
      escalation: true,
      reason: 'matched escalation trigger: "طبية"',
      action: 'Notify on-site medical/security team immediately.',
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    fireEvent.click(screen.getByRole('button', { name: /tap to speak/i }));

    const instance = FakeSpeechRecognition.instances[0];
    await act(async () => {
      instance.onresult({ results: [[{ transcript: 'حالة طبية طارئة' }]] });
    });

    const alertRegion = await screen.findByRole('alert');
    expect(alertRegion).toHaveAttribute('dir', 'rtl');
  });

  test('the Alert Nearby Staff button posts to /api/alert and then shows acknowledgement', async () => {
    mockFetchOnce(200, {
      answer: null,
      escalation: true,
      reason: 'matched escalation trigger: "chest pain"',
      action: 'Notify on-site medical/security team immediately.',
      category: 'ESCALATE',
      confidence: 'high',
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /tap to speak/i }));

    const instance = FakeSpeechRecognition.instances[0];
    await act(async () => {
      instance.onresult({ results: [[{ transcript: 'chest pain' }]] });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /alert nearby staff/i })).toBeInTheDocument();
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ acknowledged: true, alertId: 1, timestamp: '2026-07-07T00:00:00.000Z' })
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /alert nearby staff/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/alert',
      expect.objectContaining({ method: 'POST' })
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /staff alerted/i })).toBeDisabled();
    });
  });

  test('reset clears all session state back to IDLE with no residual answer shown', async () => {
    mockFetchOnce(200, {
      answer: 'Gate C is closed today.',
      category: 'GROUNDED_FACT',
      confidence: 'high',
      escalation: false,
      sourceDocs: []
    });

    render(<KioskView />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /tap to speak/i }));

    const instance = FakeSpeechRecognition.instances[0];
    await act(async () => {
      instance.onresult({ results: [[{ transcript: 'is gate c open' }]] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Gate C is closed today/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /ask another question/i }));

    expect(screen.getByText(/select your language/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gate C is closed today/)).not.toBeInTheDocument();
  });
});
