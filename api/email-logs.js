const mongoose = require('mongoose');
const cors = require('cors');
const winston = require('winston');
const EmailLog = require('../models/emailLogs');
require('dotenv').config();

// Initialize logger
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

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10
})
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error:', err));

// CORS Configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS || 'https://email-sender-client-alpha.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

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