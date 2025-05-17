const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const validator = require('validator');
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

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

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
};