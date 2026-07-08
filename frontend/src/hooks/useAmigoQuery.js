import { useState, useCallback } from 'react';
import { fetchWithTimeout } from '../fetchWithTimeout';

// Shared query-submission logic used by both the volunteer view (App.jsx) and the
// kiosk view (KioskView.jsx) — previously duplicated independently in each, which meant
// any change to the /api/query contract had to be made in two places. Both views' UI
// state machines differ (KioskView drives IDLE/LISTENING/PROCESSING/RESPONDING; App.jsx
// is a simpler form), so this hook only owns the network call and response/error shape,
// not any view-specific state transitions — callers handle their own state around it.
export function useAmigoQuery() {
  const [isLoading, setIsLoading] = useState(false);

  const submitQuery = useCallback(async ({ query, venueId, outputLanguage }) => {
    setIsLoading(true);
    try {
      const res = await fetchWithTimeout('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, venueId, outputLanguage })
      });
      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.error || 'Something went wrong. Please try again.' };
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { submitQuery, isLoading };
}
