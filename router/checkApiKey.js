const { db } = require("../lib/database");

const checkApiKey = async (req, res, next) => {
  // 🚀 Guard: kalau middleware ini sudah dijalankan sekali di request yang sama → skip
  if (req.limitChecked) return next();
  req.limitChecked = true;

  const apiKey = req.query.apikey || req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ status: false, message: "Masukan Parameter Apikey." });
  }

  try {
    // 🚫 Skip preflight (CORS OPTIONS)
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    // 🚀 Ambil user dari DB
    const user = await db.findOne({ apikey: apiKey });
    if (!user) {
      return res.status(403).json({ status: false, message: `Apikey ${apiKey} tidak ditemukan` });
    }

    // 🚨 Cek banned IP
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.ip;
    if (user.bannedIps && user.bannedIps.includes(ipAddress)) {
      return res
        .status(403)
        .json({ status: false, message: `IP ${ipAddress} diblokir untuk apikey ini` });
    }

    // 🚨 Decrement limit (hanya untuk Free user)
    const isFreeUser = !user.isPremium && !user.vip;
    if (isFreeUser) {
      const now = Date.now();

      // Atomic update: hanya kurangi kalau lastUse lebih dari 1 detik
      const updatedUser = await db.findOneAndUpdate(
        {
          apikey: apiKey,
          limit: { $gt: 0 },
          isPremium: false,
          vip: false,
          $or: [
            { lastUse: { $exists: false } },
            { lastUse: { $lt: now - 1000 } },
          ],
        },
        {
          $inc: { limit: -1 },
          $set: { lastUse: now },
        },
        { returnDocument: "after" }
      );

      if (!updatedUser) {
        return res
          .status(429)
          .json({ status: false, message: "Limit kamu sudah habis." });
      }

      req.apiKeyData = updatedUser;
    } else {
      req.apiKeyData = user;
    }

    req.isPremium = user.isPremium;
    req.vip = user.vip;
    req.detectedIp = ipAddress;

    next();
  } catch (error) {
    console.error("Error checking API key:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

module.exports = checkApiKey;