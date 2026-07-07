const request = require('supertest');
const app = require('../server');

describe('POST /api/alert', () => {
  test('logs and acknowledges a staff alert for a valid venue', async () => {
    const res = await request(app)
      .post('/api/alert')
      .send({ venueId: 'venue_01', reason: 'Kiosk escalation: possible medical emergency' });

    expect(res.status).toBe(201);
    expect(res.body.acknowledged).toBe(true);
    expect(typeof res.body.alertId).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  test('rejects a missing venueId with 400', async () => {
    const res = await request(app).post('/api/alert').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  test('falls back to a default reason when none is provided', async () => {
    const res = await request(app).post('/api/alert').send({ venueId: 'venue_02' });
    expect(res.status).toBe(201);
    expect(res.body.acknowledged).toBe(true);
  });
});
