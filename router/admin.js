const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const JSONdb = require("simple-json-db");

const config = require("../config.js");
const { db, systemDb, changelog } = require("../lib/database");
const { isAuthenticated } = require("../lib/api");
const Function = require("../lib/function");
const Func = new Function();

let tokens = "BrokerTGTA5";

async function randomText (length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let txt = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    txt += characters.charAt(randomIndex);
  }

  return txt;
};

async function delUser(e) {
  await db.findOneAndDelete({ username: e });
}

router.get("/", isAuthenticated, async (req, res) => {
  const user = req.user;
  console.log(user) 
  if (user.isAdmin) {
    res.render("admin", {
      title: `${config.web.title} || Admin Page`,
      page: config.web.title,
      user: req.user,
      message: req.flash(),
      layout: "layouts/main"
    });
  } else {
    res.redirect("/dashboard");
  }
});

// API PREMIUM
router.post('/add-redeem', async (req, res) => {
  console.log(req.body)
  const { code, limit, expiryDate, maxUsage, token } = req.body;
  if (token !== tokens) {
    req.flash("error", "Invalid Token Input");
    return res.redirect("/admin");
  } 
  if (!code || !limit || !expiryDate || !maxUsage || !token) {
    req.flash("error", "Harus ada code, description, limit, expiryDate, maxUsage, dan token");
    return res.redirect("/admin");
  }
  try {
    const newCode = new systemDb({
      code,
      limit: limit || 50,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      maxUsage: maxUsage || 1
    });
    
    await newCode.save();
    req.flash("success", `Berhasil menambahkan kode reedem ${code} dengan ${limit} limit`);
    res.redirect("/admin");
  } catch (error) {
    req.flash("error", "Error");
    console.error("Error:", error);
    return res.redirect("/admin");
  }
});

router.post("/delete/reedem-code", async (req, res) => {
  const { redeemcode, token } = req.body;
  try {
    if (token !== tokens) {
      req.flash("error", "Invalid Token Input");
      return res.redirect("/admin");
    }
    const redeem = await systemDb.findOne({ code: redeemcode, isActive: true });
    if (!redeem) {
      req.flash("error", "Redeem code tidak valid atau sudah tidak aktif");
      return res.redirect("/admin");
    }
    await systemDb.deleteOne({ code: redeemcode, isActive: true });
    req.flash("success", "Berhasil menghapus kode redeem");
    res.redirect("/admin");
  } catch (error) {
    console.error("Error saat menghapus kode redeem:", error);
    req.flash("error", "Terjadi kesalahan saat menghapus kode redeem");
    res.redirect("/admin");
  }
});

router.post("/premium/add", async (req, res) => {
  const { username, days, token } = req.body;
    
    try {
    if (token !== tokens) {
      req.flash("error", "Invalid Token Input");
      res.redirect("/admin");
    } else {
      const user = await db.findOne({ username });

      if (!user) {
        req.flash("error", "User Not Found");
        res.redirect("/admin");
      }

      user.vip = false;
      user.isPremium = true;
      user.premiumTime = new Date().getTime() + days * 86400000;
      user.limit = config.options.limitPremium;
      user.role = "Premium Account";

      await user.save();

      req.flash("success", username + " Premium added successfully");
      res.redirect("/admin");
    }
  } catch (error) {
    console.error(error);
    req.flash("error", "Error add premium user");
  }
});

router.post("/vip/add", async (req, res) => {
  const { username, days, seconds, token } = req.body;

  try {
    if (token !== tokens) {
      req.flash("error", "Invalid Token Input");
      res.redirect("/admin");
    } else {
      const user = await db.findOne({ username });

      if (!user) {
        req.flash("error", "User Not Found");
        res.redirect("/admin");
      }

      user.isPremium = true;
      user.vip = true;
      
      // Hitung durasi VIP berdasarkan days dan seconds
      const daysInMillis = days ? days * 86400000 : 0; // 1 day = 86400000 milliseconds
      const secondsInMillis = seconds ? seconds * 1000 : 0; // 1 second = 1000 milliseconds
      user.premiumTime = new Date().getTime() + daysInMillis + secondsInMillis;

      user.role = "VIP Account";

      await user.save();

      req.flash("success", `${username} VIP added successfully for ${days || 0} days and ${seconds || 0} seconds`);
      res.redirect("/admin");
    }
  } catch (error) {
    console.error(error);
    req.flash("error", "Error adding VIP user");
  }
});

router.post("/premium/delete", async (req, res) => {
  const { username, token } = req.body;
  const defaultLimit = 50; // Set your default limit here

  try {
    if (token !== tokens) {
      req.flash("error", "Invalid Token Input");
      return res.redirect("/admin");
    }

    const user = await db.findOne({ username });

    if (!user) {
      req.flash("error", "User Not Found");
      return res.redirect("/admin");
    }

    user.vip = false,
    user.isPremium = false,
    user.role = "Free Account";
    user.premiumTime = 0;
    user.vipTime = 0;
    user.limit = defaultLimit; // Set default limit here

    await user.save();

    req.flash("success", username + " Premium added successfully");
    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    req.flash("error", "Error delete premium user");
    res.redirect("/admin");
  }
});

router.get("/premium/list", async (req, res) => {
  try {
    const users = await db.find();
    let z = 1;
    const resultArray = [];

    users.forEach((user) => {
      const isPremium = user.isPremium || user.isVip; // Consider both premium and vip users
      let timer = 0;

      if (isPremium) {
        if (user.premiumTime) {
          timer = user.premiumTime - new Date();
        } else if (user.vipTime) {
          timer = user.vipTime - new Date();
        }
      }

      resultArray.push({
        no: z++,
        name: user.username,
        premium: isPremium,
        expired: timer,
        profile: user.profile,
        role: user.role,
        limit: user.limit
      });
    });

    res.json(resultArray);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.post("/users/delete-user", async (req, res) => {
  let { username, token } = req.body;
  if (token !== tokens) {
      req.flash("error", "Invalid Token Input");
      res.redirect("/admin");
    }
  await delUser(username);
  req.flash("success", username + " Users Delete successfully");
  res.redirect("/admin");
});

// Add new changelog entry
router.post('/changelog/add', async (req, res) => {
  const { date, title, description } = req.body;

  try {
    const newEntry = new changelog({
      date: new Date(date),
      title,
      description,
    });

    await newEntry.save();
    req.flash('success', 'Changelog entry added successfully');
    res.redirect('/admin');
  } catch (error) {
    req.flash('error', 'Failed to add changelog entry');
    res.redirect('/admin');
  }
});

// Edit an existing changelog entry
router.post('/changelog/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { date, title, description } = req.body;

  try {
    const entry = await changelog.findById(id);
    if (!entry) {
      req.flash('error', 'Changelog entry not found');
      return res.redirect('/admin');
    }

    entry.date = new Date(date);
    entry.title = title;
    entry.description = description;

    await entry.save();
    req.flash('success', 'Changelog entry updated successfully');
    res.redirect('/admin');
  } catch (error) {
    req.flash('error', 'Failed to update changelog entry');
    res.redirect('/admin');
  }
});

// Delete a changelog entry
router.post('/changelog/delete/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await changelog.findByIdAndDelete(id);
    req.flash('success', 'Changelog entry deleted successfully');
    res.redirect('/admin');
  } catch (error) {
    req.flash('error', 'Failed to delete changelog entry');
    res.redirect('/admin');
  }
});

// 🚨 Ban IP untuk apikey tertentu
router.post("/ban-ip", async (req, res) => {
  const { apikey, ip, token } = req.body;

  if (token !== tokens) {
    req.flash("error", "Invalid Token Input");
    return res.redirect("/admin");
  }

  if (!apikey || !ip) {
    req.flash("error", "apikey dan ip wajib diisi");
    return res.redirect("/admin");
  }

  await db.findOneAndUpdate(
    { apikey },
    { $addToSet: { bannedIps: ip } }, // addToSet biar ga dobel
    { new: true }
  );

  req.flash("success", `IP ${ip} berhasil dibanned untuk apikey ${apikey}`);
  res.redirect("/admin");
});

// 🚨 Unban IP untuk apikey tertentu
router.post("/unban-ip", async (req, res) => {
  const { apikey, ip, token } = req.body;

  if (token !== tokens) {
    req.flash("error", "Invalid Token Input");
    return res.redirect("/admin");
  }

  if (!apikey || !ip) {
    req.flash("error", "apikey dan ip wajib diisi");
    return res.redirect("/admin");
  }

  await db.findOneAndUpdate(
    { apikey },
    { $pull: { bannedIps: ip } }, // hapus dari array
    { new: true }
  );

  req.flash("success", `IP ${ip} berhasil di-unban untuk apikey ${apikey}`);
  res.redirect("/admin");
});

module.exports = router;
