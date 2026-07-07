const request = require('supertest');
const app = require('../server');

describe('CORS configuration', () => {
  test('reflects the allowed frontend origin in Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .get('/api/briefing/venue_01')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('never reflects an arbitrary, unlisted origin back to the requester', async () => {
    const res = await request(app)
      .get('/api/briefing/venue_01')
      .set('Origin', 'http://evil.example.com');

    // The header always names the one configured origin, never the arbitrary requester's
    // origin — so a browser at evil.example.com receives a value that doesn't match its
    // own origin and refuses to expose the response to that page's JavaScript.
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
