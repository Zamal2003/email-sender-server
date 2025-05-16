const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const helmet = require('helmet');
const winston = require('winston');
const EmailLog = require('./models/emailLogs');

require('dotenv').config();
mongoose.set('strictQuery', true);
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

const app = express();

// Validate environment variables
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_PASS'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing ${envVar} in .env`);
    process.exit(1);
  }
}

// Middleware
app.use(helmet()); // Security headers
// app.use(cors({ origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000' }));
// app.use(cors({
//   origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:5173'
// }));
// app.use(cors({ origin: '*' }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));


// app.use(
//   cors({
//     origin: "https://email-sender-client-alpha.vercel.app/", // Replace with your frontend URL
//     methods: ["POST"], // Allow only POST requests
//     credentials:true,
//     allowedHeaders: ["Content-Type"],
//   })
// );
app.use(express.json());
app.use('/api/send-emails', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later' }
}));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/emailTool', {
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

// API Endpoint to Send Emails
app.post('/api/send-emails', async (req, res) => {
  const { sender, recipients, subject, body } = req.body;
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

  app.get('/api/email-logs', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const logs = await EmailLog.getLogsByStatus(status, parseInt(limit));
    res.json(logs);
  } catch (error) {
    logger.error('Log retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});
  // Sanitize inputs
  const cleanSubject = sanitizeHtml(subject, { allowedTags: [], allowedAttributes: {} });
  const cleanBody = sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} });

  let sentCount = 0;
  const errors = [];

  try {
    for (const recipient of recipients) {
      const mailOptions = {
        from: sender,
        to: recipient,
        subject: cleanSubject,
        text: cleanBody
      };

      try {
        await transporter.sendMail(mailOptions);
        await EmailLog.create({
          recipient,
          status: 'sent',
          sentAt: new Date(),
          sender,
          subject
        });
        sentCount++;
      } catch (error) {
        await EmailLog.create({
          recipient,
          status: 'failed',
          error: error.message,
          sentAt: new Date(),
          sender,
          subject
        });
        errors.push(`Failed to send to ${recipient}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      logger.warn('Some emails failed to send:', errors);
      return res.status(207).json({
        message: `${sentCount} of ${recipients.length} emails sent successfully`,
        errors
      });
    }

    res.json({ message: `${sentCount} emails sent successfully` });
  } catch (error) {
    logger.error('Email sending error:', error);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

// Global Error Handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

app.use('*', (req,res)=>{
  res.json({message:'server is working properly'})
})
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