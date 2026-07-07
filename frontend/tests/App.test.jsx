import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../src/App';

function hangingFetchRespectingAbort() {
  return jest.fn(
    (url, options) =>
      new Promise((resolve, reject) => {
        if (options && options.signal) {
          if (options.signal.aborted) {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Otherwise never resolves, simulating a hung request.
      })
  );
}

describe('App request timeout', () => {
  afterEach(() => {
    delete global.fetch;
    jest.useRealTimers();
  });

  test('shows an error state instead of hanging forever when the query request times out', async () => {
    jest.useFakeTimers();
    global.fetch = hangingFetchRespectingAbort();

    render(<App />);
    fireEvent.change(screen.getByLabelText(/type your question/i), {
      target: { value: 'where is the restroom' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/thinking/i);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
