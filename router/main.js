__path = process.cwd()
const config = require("../config.js");
const path = require('path');
const fs = require('fs');
const passport = require("passport");
const express = require("express");
const router = express.Router();

const dataweb = require('../lib/DataWeb');
const RequestLog = require('../lib/RequestLog')
const { db, changelog, Utils } = require("../lib/database");
const { isAuthenticated } = require("../lib/api");

const _path = process.cwd();

async function addUtil() {
        let obj = { total: 0, today: 0, visitor: 1, util: 'util'}
        Utils.create(obj)
    }

async function getTodayReq() {
    let db = await Utils.find({})
    if (db.length == 0) { 
        await addUtil()
        return // Tidak mengembalikan apa pun
    } else {
        return // Tidak mengembalikan apa pun
    }
}

async function getTotalUser() {
        let User = await db.find({})
        return User.length
    }

router.get("/", (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('login', {
    title: `${config.web.title} - SignIn`,
    message: req.flash(), // Use flash message key
    layout: 'login',
  });
});

router.get('/dashboard', isAuthenticated, async (req, res) => {
    // Log terbaru
    const logs = await db.find().sort({ timestamp: -1 });
    

    // Ambil data lain
    const recentGets = await db.find().sort({ timestamp: -1 }).limit(10);
    const latestUser = await db.find().sort({ registeredAt: -1 }).limit(10);
    const changelogs = await changelog.find().sort({ date: -1 }).exec();

    const ipStats = await db.find({ apikey: req.user.apikey });
    const ipStatsData = ipStats.map((stat) => ({
      logs: stat.logs.map((log) => ({
        ip: log.ip,
        totalRequests: log.totalRequests,
        status: log.status,
      })),
    }));

    // Total user
    const userTotal = await getTotalUser();

    // Hari ini
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Active API
    const activeApiAgg = await db.aggregate([
      { $unwind: "$logs" },
      {
        $match: {
          "logs.date": { $gte: startOfDay },
        },
      },
      { $group: { _id: "$apikey" } },
      { $count: "totalActive" },
    ]);
    const activeApi = activeApiAgg.length > 0 ? activeApiAgg[0].totalActive : 0;

    // Requests Today
    const requestsTodayAgg = await db.aggregate([
      { $unwind: "$logs" },
      {
        $match: {
          "logs.date": { $gte: startOfDay },
        },
      },
      { $group: { _id: null, total: { $sum: "$logs.todayRequests" } } },
    ]);
    const requestsToday =
      requestsTodayAgg.length > 0 ? requestsTodayAgg[0].total : 0;

    // Error Count
    const errorAgg = await db.aggregate([
      { $unwind: "$logs" },
      {
        $match: {
          "logs.date": { $gte: startOfDay },
          "logs.status": { $regex: "^(4|5)" },
        },
      },
      { $count: "totalErrors" },
    ]);
    const errorCount = errorAgg.length > 0 ? errorAgg[0].totalErrors : 0;

    // Render halaman dashboard
    res.render("index", {
      title: `${config.web.title} || DASHBOARD`,
      pages: config.web.title,
      user: req.user,
      apikey: req.user.apikey,
      message: req.flash(),
      users: latestUser,
      ipStats: ipStatsData,
      totalreq: req.user.totalreq,
      data: { changelogs },
      recentGets,
      userTotal,
      activeApi,
      requestsToday,
      errorCount,
      layout: "index",
    });
});

router.get("/checkapikey", async (req, res) => {
  const apikey = req.query.apikey;
  if (!apikey) return res.json(Func.resValid("Masukan Parameter Apikey!"));

  try {
    const users = await db.findOne({ apikey: apikey });
    if (!users)
      return res.json(Func.resValid(`apikey \"${apikey}\" Tidak Terdaftar.`));

    // Hitung total request dari logs
    const totalRequests = users.logs.reduce((total, log) => total + log.totalRequests, 0);

    // Hitung request hari ini dari logs
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Atur waktu ke awal hari ini
    const todayRequests = users.logs.reduce((total, log) => {
      if (log.date >= today) {
        return total + log.totalRequests;
      }
      return total;
    }, 0);

    // Tentukan jenis akun
    const accountType = users.vip ? "VIP" : users.premium ? "Premium" : "Free";
    const expired = users.premiumTime ? new Date(users.premiumTime).toLocaleDateString() : "-";

    const result = {
      username: users.username,
      requests: totalRequests,
      today: todayRequests,
      account_type: accountType,
      expired: expired
    };

    res.json({
      status: 200,
      message: "success",
      result: result
    });
  } catch (e) {
    console.error(e);
    res.json(Func.resValid("Terjadi kesalahan server"));
  }
});

router.get("/price", isAuthenticated, (req, res) => {
  res.render("price", {
    title: `${config.web.title} || Pricing`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "price"
  });
});

router.get("/tiktok", isAuthenticated, (req, res) => {
  res.render("tiktok", {
    title: `${config.web.title} || Tiktok`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "tiktok"
  });
});

router.get("/download", async (req, res) => {
  res.render("download", {
    title: `${config.web.title} || Download`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "download"
  });
});

router.get("/anime", async (req, res) => {
  res.render("anime", {
    title: `${config.web.title} || Anime`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "anime"
  });
});

router.get("/search", async (req, res) => {
  res.render("search", {
    title: `${config.web.title} || Search`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "search"
  });
});

router.get("/stalking", async (req, res) => {
  res.render("stalking", {
    title: `${config.web.title} || Stalking`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "stalking"
  });
});

router.get("/tools", async (req, res) => {
  res.render("tools", {
    title: `${config.web.title} || Tools`,
    pages: config.web.title, 
    user: req.user,
    apikey: req.user.apikey, 
    message: req.flash(),
    layout: "tools"
  });
});

module.exports = router;
