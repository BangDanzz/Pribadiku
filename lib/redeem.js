const mongoose = require('mongoose');

const redeemCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  limit: { type: Number, required: true },
  premium: { type: Boolean, default: false },
  expired: { type: Date, required: true }
});

module.exports = mongoose.model('RedeemCode', redeemCodeSchema);