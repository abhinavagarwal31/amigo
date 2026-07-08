require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const queryRouter = require('./routes/query');
const briefingRouter = require('./routes/briefing');
const alertRouter = require('./routes/alert');
const { createRateLimiter } = require('./middleware/rateLimit');

const app = express();

const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));

app.use('/api/query', createRateLimiter(), queryRouter);
app.use('/api/briefing', createRateLimiter(), briefingRouter);
app.use('/api/alert', alertRouter);

// Serve static assets in production. The catch-all is registered after all /api/*
// routes and explicitly excludes them so it cannot shadow existing API endpoints
// regardless of future route additions.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Amigo backend listening on port ${PORT}`);
  });
}

module.exports = app;
