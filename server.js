const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const validator = require('validator');
const winston = require('winston');
const bodyParser = require('body-parser');
const EmailLog = require('./models/emailLogs');

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
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_PASS', 'MONGODB_URI'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing ${envVar} in .env`);
    process.exit(1);
  }
}

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(bodyParser.json());

// CORS Configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS || 'https://email-sender-client-alpha.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

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

// API Route: /api/send-emails (Adapted from api/send-emails.js)
app.post('/api/send-emails', async (req, res) => {
  const { sender, recipients, subject, body } = req.body;

  // Validation
  if (!sender || !recipients || !subject || !body) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!validator.isEmail(sender)) {
    return res.status(400).json({ error: 'Invalid sender email' });
  }
  if (recipients.length > (process.env.MAX_RECIPIENTS || 100)) {
    return res.status(400).json({ error: `Maximum ${process.env.MAX_RECIPIENTS || 100} recipients allowed` });
  }

  const invalidEmails = recipients.filter(email => !validator.isEmail(email));
  if (invalidEmails.length > 0) {
    return res.status(400).json({ error: `Invalid emails: ${invalidEmails.join(', ')}` });
  }

  // Log the email attempt
  let emailLog;
  try {
    emailLog = new EmailLog({
      sender,
      recipients,
      subject,
      body,
      status: 'pending',
    });
    await emailLog.save();
  } catch (error) {
    logger.error('Error logging email:', error);
    return res.status(500).json({ error: 'Failed to log email' });
  }

  // Send the email
  try {
    const mailOptions = {
      from: sender,
      to: recipients,
      subject: subject,
      text: body,
    };
    await transporter.sendMail(mailOptions);
    emailLog.status = 'sent';
    await emailLog.save();
    res.status(200).json({ message: 'Email sent and logged successfully' });
  } catch (error) {
    logger.error('Error sending email:', error);
    emailLog.status = 'failed';
    await emailLog.save();
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// API Route: /api/email-logs (Adapted from api/email-logs.js)
app.get('/api/email-logs', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const logs = await EmailLog.getLogsByStatus(status, parseInt(limit));
    res.status(200).json(logs);
  } catch (error) {
    logger.error('Log retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

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