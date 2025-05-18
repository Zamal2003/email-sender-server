const cors = require('cors');
const winston = require('winston');
const EmailLog = require('../models/emailLogs');

require('dotenv').config();

// CORS Configuration (must match server.js)
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS || 'https://email-sender-client-alpha.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

// Use the logger from the server context
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = async (req, res) => {
  const corsMiddleware = cors(corsOptions);
  corsMiddleware(req, res, async () => {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { status, limit = 100 } = req.query;
      const logs = await EmailLog.getLogsByStatus(status, parseInt(limit));
      res.status(200).json(logs);
    } catch (error) {
      logger.error('Log retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve logs' });
    }
  });
};