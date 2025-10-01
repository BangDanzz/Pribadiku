const express = require("express");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();

const config = require("../config");
const { Saweria } = require("../lib/saweria");
const { db, systemDb, notif, ip } = require("../lib/database");
const { isAuthenticated, checkPremium } = require("../lib/api");
const Function = require("../lib/function");
const Func = new Function();
const RedeemCode = require('../lib/redeem');

async function timer(milliseconds) {
  if (milliseconds <= 0) {
    return "-";
  }

  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((milliseconds % (60 * 1000)) / 1000);

  return `${days} Days ${hours} Hours ${minutes} Minutes ${seconds} Seconds`;
}

async function getApikey(id) {
  let users = await db.findOne({ _id: id })
  return { nomor: users.nomor, join: users.join, expired: users.tierexpired, TotalRequest: users.TotalRequests };
}

const fetchNotifications = async () => {
  try {
    return await notif.find().sort({ createdAt: -1 });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return []; 
  }
};

async function tanggal() {
	var myMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
	var myDays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum at", "Sabtu"];
	var tgl = new Date();
	var day = tgl.getDate();
	var bulan = tgl.getMonth();
	var thisDay = tgl.getDay();
	var ThisDay = myDays[thisDay];
	var yy = tgl.getYear();
	var year = (yy < 1000) ? yy + 1900 : yy;
	return `${ThisDay}, ${day} - ${myMonths[bulan]} - ${year}`;
}

// Middleware untuk mengecek status premium
const checkPremiumStatus = async (req, res, next) => {
  const { username } = req.body;

  try {
    const user = await db.findOne({ username });

    if (!user) {
      return next();
    }

    const currentTime = new Date().getTime();

    // Jika premiumTime sudah lewat, ubah status ke free account
    if (user.isPremium && currentTime > user.premiumTime) {
      user.isPremium = false;
      user.vip = false;
      user.limit = config.options.limit; // Kembalikan limit ke akun free
      user.role = "Free Account";

      await user.save();
    }

    next();
  } catch (error) {
    console.error("Error checking premium status:", error);
    next();
  }
};

// Route untuk memblokir atau mengaktifkan IP
router.post('/toggle-status/:ip', async (req, res) => {
  const { ip } = req.params;

  try {
    const user = await db.findOne();
    if (!user) return res.status(404).send('User not found');

    const log = user.logs.find(log => log.ip === ip);
    if (log) {
      log.status = log.status === 'active' ? 'blocked' : 'active';
    }

    await user.save();
    res.redirect('/users/profile');
  } catch (error) {
    res.status(500).send('Error updating IP status');
  }
});

router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const getinfo = await getApikey(req.user.id);
    const { nomor, join } = getinfo;

    const user = req.user;
    const { username, apikey, totalRequests = 0 } = user;
    const isAdmin = config.options.own.includes(username);

    // ✅ Ambil IP real-time dari request
    const currentIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;

    // Ambil data logs hanya milik user ini (berdasarkan apikey)
    const userData = await db.findOne({ apikey: user.apikey });
    const ipLogs = userData ? userData.logs.map((log) => ({
      ip: log.ip,
      totalRequests: log.totalRequests,
      todayRequests: log.todayRequests,
      status: log.status,
      date: log.date
    })) : [];

    const notifications = await fetchNotifications();

    // Hitung expired premium
    const expired = user.premiumTime 
      ? new Date(user.premiumTime).toLocaleDateString() 
      : "-";
      
    const bannedIps = userData ? userData.bannedIps : [];

    // Render halaman profil dengan data yang diperlukan
    res.render('profile', {
  title: `${config.web.title} || DASHBOARD`,
  pages: config.web.title,
  isAdmin,
  user,
  nomor,
  notifications,
  expired,
  since: user.since,
  totalrequest: user.totalreq,
  apikey: user.apikey,
  ipLogs,              // hanya log user ini
  currentIp,           // ✅ kirim IP real-time ke EJS
  bannedIps,           // ✅ kirim bannedIps ke EJS
  lastLogin: user.lastLogin,
  message: req.flash(),  
  layout: 'profile'
});
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Server Error', error: err });
  }
});

router.post('/redeem', async (req, res) => {
  try {
    const user = req.user; 
    const { redeemcode } = req.body; 
    const redeem = await systemDb.findOne({ code: redeemcode, isActive: true });
    
    if (!redeem) {
      req.flash('error', 'Redeem code tidak valid');
      return res.redirect('/users/profile');
    }

    const users = await db.findOne({ email: user.email });
    if (!users) {
      req.flash('error', 'User not found');
      return res.redirect('/users/profile');
    }

    if (users.redeemcode.includes(redeemcode)) {
      req.flash('error', 'Redeem code sudah digunakan');
      return res.redirect('/users/profile');
    }

    if (redeem.expiryDate && redeem.expiryDate < new Date()) {
      req.flash('error', 'Kode redeem sudah kedaluwarsa.');
      return res.redirect('/users/profile');
    }

    if (redeem.usageCount >= redeem.maxUsage) {
      req.flash('error', 'Kode redeem sudah melebihi batas penggunaan');
      return res.redirect('/users/profile');
    }

    // Jika kode premium
    if (redeem.isPremium) {
      users.isPremium = true;
      users.premiumTime = new Date().getTime() + redeem.premiumDays * 86400000; // Tambahkan waktu premium sesuai jumlah hari
      req.flash('success', `Kode redeem berhasil diklaim! Kamu mendapatkan premium selama ${redeem.premiumDays} hari.`);
    } else {
      users.limit += redeem.limit;
      req.flash('success', `Kode redeem berhasil diklaim! Limit bertambah sebanyak ${redeem.limit}.`);
    }

    users.redeemcode.push(redeemcode);
    redeem.usageCount += 1;

    await users.save();
    await redeem.save();
    
    res.redirect('/users/profile');
  } catch (error) {
    req.flash('error', 'Internal Server Error');
    console.error("Error:", error);
    res.redirect('/users/profile');
  }
});

router.post('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if(!currentPassword || !newPassword) 
      return res.json({ success: false, message: "All fields are required." });

    const user = await db.findById(req.user._id);

    const match = await bcrypt.compare(currentPassword, user.password);
    if(!match) return res.json({ success: false, message: "Current password salah." });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await db.findByIdAndUpdate(req.user._id, { password: hashedPassword });

    return res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    return res.json({ success: false, message: "Failed to change password." });
  }
});

router.post("/settings", async (req, res) => {
  try {
    // Validasi apakah req.user ada
    if (!req.user || !req.user._id) {
      req.flash('error', 'User is not logged in');
      return res.redirect('/users/login'); // Redirect ke halaman login jika user belum login
    }

    // Cari user di database
    const user = await db.findOne({ _id: req.user._id });

    // Jika user tidak ditemukan
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/users/profile');
    }

    // Perbarui username dan profile jika ada inputnya
    if (req.body.username) user.username = req.body.username;
    if (req.body.profile) user.profile = req.body.profile;

    // Cek apakah user mencoba mengganti apikey
    if (req.body.apikey) {
      // Pastikan tidak ada duplikasi apikey
      const existingApiKeyUser = await db.findOne({ apikey: req.body.apikey });

      if (existingApiKeyUser && existingApiKeyUser._id.toString() !== req.user._id.toString()) {
        req.flash('error', 'Mohon Maaf Apikey Yang Anda Masukkan Tidak Boleh Sama Dengan Apikey Sebelumnya :)');
        return res.redirect('/users/profile'); // Tidak izinkan jika apikey sudah digunakan user lain
      }

      // Hanya izinkan perubahan apikey jika pengguna Premium atau VIP
      if (user.isPremium || user.vip) {
        user.apikey = req.body.apikey; // Ganti apikey jika memenuhi syarat
      } else {
        req.flash('error', 'Anda Bukan User Premium Dan VIP :(');
        return res.redirect('/users/profile'); // Tidak izinkan user free mengubah apikey
      }
    }

    // Perbarui status premium dan vip (jika perubahan diizinkan dari UI admin)
    if (typeof req.body.premium !== 'undefined') user.isPremium = req.body.premium === 'true';
    if (typeof req.body.vip !== 'undefined') user.vip = req.body.vip === 'true';

    // Simpan perubahan user ke database
    await user.save();

    // Berikan pesan sukses jika semua perubahan berhasil disimpan
    req.flash('success', 'Settings updated successfully');
    res.redirect('/users/profile'); 

  } catch (error) {
    // Jika ada kesalahan duplikasi indeks (E11000), tangani dengan pesan khusus
    if (error.code === 11000) {
      req.flash("error", 'Duplicate key error: Apikey or IP address already exists.');
    } else {
      // Tangani kesalahan internal lainnya
      req.flash("error", 'Internal Server Error');
    }
    req.flash('Error while updating user settings:', error);
    res.redirect('/users/profile');
  }
});

// Change Apikey
router.post("/changeApikey", isAuthenticated, async (req, res) => {
  const { apikey } = req.body;
  if(!apikey) return res.json({ success: false, message: "Masukan Apikey." });

  const user = req.user;
  const users = await db.findOne({ email: user.email });

  if(users.isPremium || users.vip){
    await db.updateOne({ email: user.email }, { apikey });
    return res.json({ success: true, message: "Apikey berhasil diubah." });
  } else {
    return res.json({ success: false, message: "Kamu bukan user Premium atau VIP." });
  }
});

// Delete Account
router.post("/delete-account", isAuthenticated, async (req, res) => {
  try {
    await db.deleteOne({ email: req.user.email });
    return res.json({ success: true, message: "Account berhasil dihapus." });
  } catch(err){
    return res.json({ success: false, message: "Gagal menghapus account." });
  }
});

module.exports = router 
