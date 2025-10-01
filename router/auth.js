const express = require("express");
const passport = require("passport");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require("../lib/database");
const Token = require('../lib/Token');
const mailer = require('./email.js');
const router = express.Router();
const config = require("../config");
const Func = new (require('./function.js'))();
const { v4: uuidv4 } = require('uuid');

function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function getHashedPassword(password) {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}

function randomText(length) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () =>
    characters.charAt(Math.floor(Math.random() * characters.length))
  ).join('');
}

function tanggal() {
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

router.get('/auth/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('login', {
    title: `${config.web.title} - SignIn`,
    message: req.flash(), // Use flash message key
    layout: 'login',
  });
});

router.post('/auth/login', async (req, res) => {
  const { emailOrNumber, password } = req.body;

  if (req.isAuthenticated()) return res.redirect('/dashboard');

  try {
    const user = await db.findOne({
      $or: [{ email: emailOrNumber }, { number: emailOrNumber }],
    });

    console.log(user);

    if (!user) {
      req.flash('error', 'Invalid email or number.');
      return res.redirect('/auth/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(isMatch);
    if (!isMatch) {
      req.flash('error', 'Invalid password.');
      return res.redirect('/auth/login');
    }

    if (!user.isVerified) {
      const token = crypto.randomBytes(32).toString('hex');
      await Token.create({
        userId: user._id,
        token,
        type: 'verification',
        expires: Date.now() + 3600000,
      });
      return res.redirect(`/verify/${token}`);
    }

    req.logIn(user, (err) => {
      if (err) {
        req.flash('error', 'Login failed.');
        return res.redirect('/auth/login');
      }
      res.redirect('/dashboard');
    });
  } catch (error) {
    req.flash('error', 'An error occurred during login.');
    res.redirect('/auth/login');
  }
});

// Register page
router.get('/register', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('register', {
    title: `${config.web.title} - SignUp`,
    message: req.flash(), // Use flash message key
    layout: 'layouts/main',
  });
});

router.post('/register', async (req, res) => {
  const { username, email, number, password } = req.body;

  // Kalau user sudah login
  if (req.isAuthenticated()) {
    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: false, message: 'Already logged in.' });
    }
    return res.redirect('/dashboard');
  }

  try {
    // Validasi input
    if (!username || !email || !number || !password) {
      req.flash('error', 'Lengkapi semua data.');
      return res.redirect('/register');
    }

    // Cek duplikat email atau nomor
    const numbers = number.replace(/\D/g, '');
    const existing = await db.findOne({ $or: [{ email }, { number: numbers }] });
    if (existing) {
      req.flash('error', 'Email atau nomor sudah digunakan.');
      return res.redirect('/register');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate token & kode verifikasi
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
    const token = verificationCode; // bisa pakai langsung sebagai token

    // Generate API key dan avatar
    const key = `htrkey-${await randomText(12)}`;
    const avatarUrl = `https://ui-avatars.com/api/?name=${username.charAt(0).toUpperCase()}&background=ff0000&color=ffffff`;
    const userId = uuidv4();

    // Buat user baru
    const newUser = new db({
      userId,
      username,
      email,
      number: numbers,
      password: hashedPassword,
      apikey: key,
      defaultKey: key,
      profile: avatarUrl,
      role: "Free Account",
      since: tanggal(),
      isAdmin: false,
      isVerified: false,
      isPremium: false,
      vip: false,
      vipTime: 0,
      premiumTime: 0,
      totalreq: 0,
      join: Date.now()
    });
    await newUser.save();

    // Simpan token verifikasi
    await Token.create({
      userId: newUser._id,
      token,
      type: 'verification',
      expires: Date.now() + 2 * 60 * 1000 // 2 menit
    });

    // Response JSON jika fetch
    if (req.headers['content-type'] === 'application/json') {
      return res.json({
        success: true,
        message: `Berhasil daftar!`,
        token
      });
    }

    // Redirect untuk form biasa
    req.flash('success', `Berhasil daftar!`);
    res.redirect(`/verify/${token}`);
  } catch (error) {
    console.error(error);
    if (req.headers['content-type'] === 'application/json') {
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
    req.flash('error', 'Terjadi kesalahan saat mendaftar.');
    res.redirect('/register');
  }
});

// Verification page
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const tokenRecord = await Token.findOne({ token, type: 'verification', expires: { $gt: Date.now() } });
    console.log('Verify Token', tokenRecord);

    if (!tokenRecord) {
      req.flash('error', 'Invalid or expired token.');
      return res.redirect('/register');
    }

    // Render halaman verify dengan kode langsung
    res.render('verify', {
      title: 'Verify',
      message: req.flash(),
      token,
      verificationCode: tokenRecord.token, // 🔑 Kirim kode verifikasi ke EJS
      layout: 'verify',
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'An error occurred while processing the verification.');
    res.redirect('/register');
  }
});

// Verify handler
router.post('/verify', async (req, res) => {
  const { verificationCode } = req.body;

  try {
    const tokenRecord = await Token.findOne({ token: verificationCode, type: 'verification', expires: { $gt: Date.now() } });
    if (!tokenRecord) return res.json({ success: false, message: 'Kode salah atau kadaluarsa' });

    const user = await db.findById(tokenRecord.userId);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan' });

    user.isVerified = true;
    await user.save();
    await Token.deleteOne({ _id: tokenRecord._id });

    return res.json({ success: true, message: 'Verifikasi berhasil! Silakan login.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: 'Terjadi kesalahan saat verifikasi.' });
  }
});

// Resend verification code route
router.get('/resend-verification/:token', async (req, res) => {
  const { token } = req.params;

  try {
    console.log('Looking for token:', token);

    const tokenRecord = await Token.findOne({ token });
    console.log('Found tokenRecord:', tokenRecord);

    if (!tokenRecord) {
      req.flash('error', 'Invalid token or expired.');
      return res.redirect('/register');
    }

    const user = await db.findById(tokenRecord.userId);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/register');
    }

    user.verificationCode = generateVerificationCode();
    user.verificationCodeExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    if (user.number) {
      await Func.sendWhatsAppVerification(
        user.number,
        user.verificationCode,
        token
      );
    }

    if (user.email) {
      await mailer.sendVerifyEmail(user.email, user.verificationCode, token);
    }

    req.flash(
      'success',
      'Verification code resent successfully. Check your email or WhatsApp.'
    );
    res.redirect(`/verify/${token}`);
  } catch (error) {
    console.error(error);
    req.flash('error', 'An error occurred while resending verification code.');
    res.redirect('/verify');
  }
});

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/authentation"); 
  },
);

router.post("/auth/apikey", async (req, res) => {
  const { apikey } = req.body;
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }

  try {
    const user = await db.findOne({ apikey });

    if (user) {
      req.logIn(user, (err) => {
        if (err) {
          console.error("Error during login:", err);
          req.flash("error", "An unexpected error occurred");
          res.redirect("/authentation");
        } else {
          req.flash("success", "Login Succes...");	
          res.redirect("/dashboard");
        }
      });
    } else {
      req.flash("error", "Invalid API key");
      res.redirect("/authentation");
    }
  } catch (error) {
    console.error("Error during login:", error);
    req.flash("error", "An unexpected error occurred");
    res.redirect("/authentation");
  }
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    title: `${config.options.title} - Forget Password`,
    message: req.flash(),
    reset: false,
    layout: 'forgot-password',
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await db.findOne({ email });
    if (!user) {
      req.flash('error', 'No account found with that email.');
      return res.redirect('/forgot-password');
    }

    const token = crypto.randomBytes(32).toString('hex');
    await Token.create({
      userId: user._id,
      token,
      type: 'resetPassword',
      expires: Date.now() + 3600000,
    });

    await mailer.sendResetEmail(user.email, token);

    req.flash('success', 'Password reset link has been sent to your email.');
    res.redirect('/forgot-password');
  } catch (error) {
    console.log(error);
    req.flash('error', 'An error occurred while processing your request.');
    res.redirect('/forgot-password');
  }
});

// Reset password page
router.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const tokenRecord = await Token.findOne({
      token,
      type: 'resetPassword',
      expires: { $gt: Date.now() },
    });
    if (!tokenRecord) return res.redirect('/forgot-password');

    res.render('reset-password', {
      title: 'Reset Password',
      message: req.flash('error'),
      token,
      layout: 'reset-password',
    });
  } catch (error) {
    res.redirect('/forgot-password');
  }
});

// Reset password handler
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    const tokenRecord = await Token.findOne({
      token,
      type: 'resetPassword',
      expires: { $gt: Date.now() },
    });
    if (!tokenRecord) {
      req.flash('error', 'Invalid or expired reset token.');
      return res.redirect(`/reset-password/${token}`);
    }

    const user = await db.findById(tokenRecord.userId);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/forgot-password');
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    await Token.deleteOne({ _id: tokenRecord._id });

    req.flash('success', 'Password has been reset successfully.');
    res.redirect('/auth/login');
  } catch (error) {
    console.error(error);
    req.flash('error', 'An error occurred while resetting your password.');
    res.redirect(`/reset-password/${token}`);
  }
});

router.post('/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (req.isAuthenticated()) return res.redirect('/dashboard');

  try {
    const user = await db.findById(req.user._id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/users/profile');
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      req.flash('error', 'Old password is incorrect.');
      return res.redirect('/users/profile');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    req.flash('success', 'Password has been changed successfully.');
    res.redirect('/dashboard');
  } catch (error) {
    req.flash('error', 'An error occurred while changing your password.');
    res.redirect('/users/profile');
  }
});

router.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/login");
  });
});

module.exports = router;
