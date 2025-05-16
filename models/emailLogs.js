const mongoose = require('mongoose');
const validator = require('validator');

const emailLogSchema = new mongoose.Schema({
  recipient: { 
    type: String, 
    required: true,
    validate: {
      validator: validator.isEmail,
      message: 'Invalid email format'
    }
  },
  status: { 
    type: String, 
    enum: ['sent', 'failed'], 
    required: true 
  },
  error: { 
    type: String, 
    default: '' 
  },
  sentAt: { 
    type: Date, 
    default: Date.now 
  },
  sender: { 
    type: String, 
    required: true 
  },
  subject: { 
    type: String, 
    required: true 
  }
}, { timestamps: true });

// Normalize recipient email to lowercase
emailLogSchema.pre('save', function (next) {
  this.recipient = this.recipient.toLowerCase();
  next();
});

// Indexes for performance
emailLogSchema.index({ recipient: 1 });
emailLogSchema.index({ sentAt: -1 });
emailLogSchema.index({ status: 1 });

// Optional: TTL index for retention (30 days)
emailLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static method for querying logs
emailLogSchema.statics.getLogsByStatus = function (status, limit = 100) {
  return this.find({ status }).limit(limit).sort({ sentAt: -1 });
};


module.exports = mongoose.model('EmailLog', emailLogSchema);