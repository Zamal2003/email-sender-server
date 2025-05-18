const cors = require('cors');
const nodemailer = require('nodemailer');
const validator = require('validator');
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

// Use the logger and transporter from the server context
// Assuming they are passed or accessible globally; here we re-import for clarity
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
    const maxRecipients = parseInt(process.env.MAX_RECIPIENTS) || 100;
    if (recipients.length > maxRecipients) {
      return res.status(400).json({ error: `Maximum ${maxRecipients} recipients allowed` });
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
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
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