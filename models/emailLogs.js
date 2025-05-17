const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    trim: true,
  },
  recipients: {
    type: [String],
    required: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  body: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Static method to get logs by status
emailLogSchema.statics.getLogsByStatus = async function(status, limit) {
  const query = status ? { status } : {};
  return await this.find(query).limit(limit).sort({ createdAt: -1 });
};

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;