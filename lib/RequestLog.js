const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema({
  apikey: { type: String, required: true },        // API key user
  ip: { type: String, required: true },            // IP address request
  endpoint: { type: String, required: true },      // endpoint yang dipanggil
  method: { type: String, default: 'GET' },        // method (GET, POST, dll)
  status: { type: Number, default: 200 },          // HTTP status code (200, 400, 500)
  userAgent: { type: String },                     // browser/device info
  createdAt: { type: Date, default: Date.now }     // waktu request
});

// Index untuk optimasi query by createdAt
requestLogSchema.index({ createdAt: 1 });

module.exports = mongoose.model('RequestLog', requestLogSchema);