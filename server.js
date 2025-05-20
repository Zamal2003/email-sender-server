const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const winston = require('winston');
const sendEmails = require('./api/send-emails');
const emailLogs = require('./api/email-logs');

require('dotenv').config();

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

// Validate environment variables
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_PASS', 'MONGO_URI'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing ${envVar} in .env`);
    process.exit(1);
  }
}

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(express.json()); // Parse JSON bodies

// CORS Configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10
})
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error:', err));

// MongoDB connection events
mongoose.connection.on('connected', () => logger.info('MongoDB connection established'));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('error', err => logger.error('MongoDB error:', err));

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) logger.error('SMTP error:', error);
  else logger.info('SMTP server ready');
});

// API Routes
app.post('/api/send-emails', sendEmails);
app.get('/api/email-logs', emailLogs);

// Fallback route
app.use('*', (req, res) => {
  res.json({ message: 'server is working properly' });
});

// Global Error Handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;