import { renderHook, act } from '@testing-library/react';
import { useAmigoQuery } from '../src/hooks/useAmigoQuery';
import { fetchWithTimeout } from '../src/fetchWithTimeout';

jest.mock('../src/fetchWithTimeout');

describe('useAmigoQuery', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns { ok: true, data } and posts the expected request body on success', async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'Gate A is open.' })
    });

    const { result } = renderHook(() => useAmigoQuery());

    let outcome;
    await act(async () => {
      outcome = await result.current.submitQuery({
        query: 'is gate a open',
        venueId: 'venue_01',
        outputLanguage: 'en-US'
      });
    });

    expect(outcome).toEqual({ ok: true, data: { answer: 'Gate A is open.' } });
    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'is gate a open', venueId: 'venue_01', outputLanguage: 'en-US' })
    });
  });

  test('returns { ok: false, error } using the server-provided message when the response is not ok', async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'venueId must be a string' })
    });

    const { result } = renderHook(() => useAmigoQuery());

    let outcome;
    await act(async () => {
      outcome = await result.current.submitQuery({ query: 'x', venueId: 1, outputLanguage: 'en-US' });
    });

    expect(outcome).toEqual({ ok: false, error: 'venueId must be a string' });
  });

  test('falls back to a generic error message when the response is not ok and has no error field', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useAmigoQuery());

    let outcome;
    await act(async () => {
      outcome = await result.current.submitQuery({ query: 'x', venueId: 'v', outputLanguage: 'en-US' });
    });

    expect(outcome).toEqual({ ok: false, error: 'Something went wrong. Please try again.' });
  });

  test('returns { ok: false, error } when the network call throws (e.g. timeout/abort)', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('The operation was aborted.'));

    const { result } = renderHook(() => useAmigoQuery());

    let outcome;
    await act(async () => {
      outcome = await result.current.submitQuery({ query: 'x', venueId: 'v', outputLanguage: 'en-US' });
    });

    expect(outcome).toEqual({ ok: false, error: 'Could not reach the server. Please try again.' });
  });

  test('isLoading is true while the request is in flight and false once it settles', async () => {
    let resolveFetch;
    fetchWithTimeout.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => useAmigoQuery());
    expect(result.current.isLoading).toBe(false);

    let submitPromise;
    act(() => {
      submitPromise = result.current.submitQuery({ query: 'x', venueId: 'v', outputLanguage: 'en-US' });
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ answer: 'ok' }) });
      await submitPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
