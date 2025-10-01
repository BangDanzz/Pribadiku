const config = require("../config")
const mongoose = require("mongoose")

exports.connectToMongoDb = () => {
  try {
    mongoose.connect(config.mongoURL)
    const mongo = mongoose.connection;
    mongo.on('error', console.error.bind(console, 'Connection error:'));
    mongo.once('open', () => {
      console.log('</> Success connect to MongoDb ');
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
};

const notificationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  message: { type: String, required: true },
  profileurl: { type: String,required: true },
  createdAt: { type: Date, default: Date.now }
});

const systemSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  limit: { type: Number, default: 10 },
  expiryDate: { type: Date },
  maxUsage: { type: Number, default: 1 },
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isPremium: { type: Boolean, default: false }, 
  premiumDays: { type: Number, default: null },
});

const data = mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  googleId: { type: String },
  username: { type: String, required: true },
  password: { type: String },
  number: { type: String, default: '' },
  email: { type: String, required: true, unique: true },
  apikey: { type: String, required: true },
  limit: { type: Number, default: 25 },
  isPremium: { type: Boolean },
  premiumLimit: { type: Number },
  profile: { type: String },
  isAdmin: { type: Boolean, default: false },
  premium: { type: Boolean, default: false },
  premiumTime: { type: Number },
  vip: { type: Boolean },
  vipTime: { type: Number },
  role: { type: String },
  since: { type: String },
  timestamp: { type: Date, default: Date.now },
  totalHits: { type: Number, default: 1 },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  tierexpired: { type: Number },
  date: { type: Date, default: Date.now },
  jid: { type: String },
  join: { type: Date, default: Date.now },
  totalRequests: { type: Number, default: 0 },
  redeemcode: { type: [String] },
  lastLogin: { type: Date, default: Date.now },
  expiredDate: { type: Date, default: null },
  bannedIps: { type: [String], default: [] },
  logs: [
    {
      ip: { type: String, required: true },
      totalRequests: { type: Number, default: 0 },
      todayRequests: { type: Number, default: 0 },
      date: { type: Date, default: Date.now },
      status: { type: String },
    },
  ],
  defaultKey: { type: String },

  // 👇 Tambahin ini
  lastUse: { type: Number, default: 0 }
});

const changelogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
});

data.index({ apikey: 1, 'logs.ip': 1 }, { unique: true });

exports.changelog = mongoose.model('Changelog', changelogSchema);
exports.db = mongoose.model('user', data);
exports.notif = mongoose.model('notifikasi', notificationSchema);
exports.systemDb = mongoose.model('System', systemSchema);