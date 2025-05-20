const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipients: [{ type: String, required: true }],
  subject: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed'], required: true },
  messageId: { type: String },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
});

emailLogSchema.statics.getLogsByStatus = async function (status, limit) {
  const query = status ? { status } : {};
  return this.find(query).limit(limit).sort({ createdAt: -1 });
};

module.exports = mongoose.model('EmailLog', emailLogSchema);