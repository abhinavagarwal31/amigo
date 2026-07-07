require('dotenv').config();
const express = require('express');
const cors = require('cors');

const queryRouter = require('./routes/query');
const briefingRouter = require('./routes/briefing');
const alertRouter = require('./routes/alert');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api/query', queryRouter);
app.use('/api/briefing', briefingRouter);
app.use('/api/alert', alertRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Volunteer Co-Pilot backend listening on port ${PORT}`);
  });
}

module.exports = app;
