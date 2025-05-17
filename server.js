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
const requiredEnvVars = ['EMAIL_USER', 'EMAIL_PASS'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing ${envVar} in .env`);
    process.exit(1);
  }
}

const app = express();

// Middleware
app.use(helmet()); // Security headers
// app.use(cors({ origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000' }));
// app.use(cors({
//   origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:5173'
// }));
// app.use(cors({ origin: '*' }));

// // CORS Configuration
// const allowedOrigins = [
//   'https://email-sender-client-alpha.vercel.app',
//   'http://localhost:5173'
// ];

// const corsOptions = {
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps or curl)
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('CORS not allowed for this origin: ' + origin));
//     }
//   },
//   methods: ['GET', 'POST', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
// };

// CORS middleware (NO trailing slash in origin, include OPTIONS method)
app.use(
  cors({
    origin: "https://email-sender-client-alpha.vercel.app", // ✅ No trailing slash
    methods: ["GET", "POST", "OPTIONS"],                    // ✅ Include OPTIONS
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],     // ✅ Authorization if needed
  })
);

// Ensure OPTIONS preflight requests are handled
app.use(cors(corsOptions));
mongoose.set('strictQuery', true);

app.use(bodyParser.json());

app.options('*', cors());

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

});
// ✅ Outside of /api/send-emails
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

module.exports = app;
