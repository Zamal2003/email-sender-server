const express = require('express');
const nodemailer = require('nodemailer');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const EmailLog = require('../models/emailLogs');
require('dotenv').config();

const router = express.Router();

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

// Rate limiting middleware for /api/send-emails
const sendEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later' }
});

// Send Emails Route
router.post('/send-emails', sendEmailLimiter, async (req, res) => {
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
  try {
    const emailLog = new EmailLog({
      sender,
      recipients,
      subject,
      body,
      status: 'pending',
    });
    await emailLog.save();
    res.status(200).json({ message: 'Email logged, sending not implemented' });
  } catch (error) {
    logger.error('Error logging email:', error);
    res.status(500).json({ error: 'Failed to log email' });
  }
});

// Get Email Logs Route
router.get('/email-logs', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const logs = await EmailLog.getLogsByStatus(status, parseInt(limit));
    res.json(logs);
  } catch (error) {
    logger.error('Log retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

module.exports = router;