const request = require('supertest');
const app = require('../server');
const alertRouter = require('../routes/alert');

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

  test('caps the in-memory alerts array at MAX_ALERTS, dropping the oldest', async () => {
    const overflow = 20;
    let lastAlertId;

    for (let i = 0; i < alertRouter.MAX_ALERTS + overflow; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/alert').send({ venueId: 'venue_01' });
      lastAlertId = res.body.alertId;
    }

    expect(alertRouter.alerts.length).toBe(alertRouter.MAX_ALERTS);
    // The oldest entries were evicted, so the earliest surviving alert's id reflects that.
    expect(alertRouter.alerts[0].id).toBe(lastAlertId - alertRouter.MAX_ALERTS + 1);
    expect(alertRouter.alerts[alertRouter.alerts.length - 1].id).toBe(lastAlertId);
  });
});
