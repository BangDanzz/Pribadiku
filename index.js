const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const MongoStore = require('connect-mongo')
const mongoose = require('mongoose');
const flash = require('connect-flash');
const logger = require("morgan")
const http = require('http');
const expressLayouts = require('express-ejs-layouts');
const socketIo = require('socket.io');

const fs = require("fs")
const chalk = require("chalk");
const figlet = require("figlet");
const path = require("path");
const cron = require("node-cron");
const JSONdb = require("simple-json-db");

const {
  connectToMongoDb,
  db
} = require("./lib/database")
const { resetLimit, updateExpiredPremium, expiredPremiumUsers, expiredVipUsers } = require("./lib/db");
const { runRecordEndpointsInChangelog } = require("./lib/api");

const config = require("./config")

const api = require("./router/api");
const main = require("./router/main");
const admin = require("./router/admin");
const auth = require("./router/auth");
const users = require("./router/users");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || config.options.port

app.set('trust proxy', true);
app.set("json spaces", 2);
app.set('view engine', 'ejs');
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // skip limit
  }
  next();
});
app.use(express.static(path.join(__dirname, '/public')));
app.use(expressLayouts);

app.use(logger('dev'));
app.use(bodyParser.json());

app.use(express.json({
  limit: '5mb'
}));
app.use(express.urlencoded({
  extended: true,
  limit: '5mb'
}));
app.use(bodyParser.text({ type: "text/html" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none';");

  next();
});


app.use((req, res, next) => {
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  || req.headers['x-real-ip']
                  || req.ip; // fallback
  console.log("Detected IP:", ipAddress);
  req.detectedIp = ipAddress;
  next();
});

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 86400000
  },
  store: MongoStore.create({
    mongoUrl: config.mongoURL
  }),
}));
app.use(passport.initialize());
app.use(passport.session());
require('./lib/config')(passport);
app.use(flash());

app.use("/", api);
app.use("/", main);
app.use("/", auth);
app.use("/users", users);
app.use("/admin", admin);

app.use(function (req, res, next) {
  res.status(404).render("message/404", {
  	title: `${config.web.title} - Error 404`,
        layout: "404"
  })
})

app.use(function (req, res, next) {
  res.status(500).render("message/500", {
  	title: `${config.web.title} - Error 505`,
  	layout: "500"
  })
})

app.use(function(req, res, next) {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  next();
})

const sendNotification = (message) => {
  io.emit('notification', message); // Mengirim notifikasi ke semua klien
};

connectToMongoDb()
setInterval(expiredPremiumUsers, 60000);
setInterval(expiredVipUsers, 60000);

// ✅ Reset limit semua user
const resetAllUserLimits = async () => {
  try {
    // Reset limit untuk Free Account (atau user tanpa premium/vip)
    const freeAccountUpdateResult = await db.updateMany(
      { $or: [ { role: "Free Account" }, { isPremium: false, vip: false } ] },
      { $set: { limit: config.options.limit } }
    );

    console.log(`✅ Reset limits Free Account: ${freeAccountUpdateResult.modifiedCount} users`);

    // Reset limit untuk Premium
    const premiumUpdateResult = await db.updateMany(
      { isPremium: true, vip: false },
      { $set: { limit: config.options.limitPremium } }
    );

    console.log(`✅ Reset limits Premium: ${premiumUpdateResult.modifiedCount} users`);

    sendNotification("✨ Semua limit Free & Premium berhasil direset ke default");
  } catch (error) {
    console.error("❌ Error reset limit:", error);
  }
};

// 🕛 Cron jalan setiap hari jam 00:00 (Asia/Makassar)
cron.schedule("0 0 * * *", async () => {
  await resetAllUserLimits();
  await expiredPremiumUsers();
  await expiredVipUsers();
}, {
  timezone: "Asia/Makassar",
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

app.listen(port, () => {
  console.log(chalk.white(figlet.textSync(`[ Hitori APi ]`, {
    horizontalLayout: 'full'
  })));
  console.log(chalk.green(`\nStart Server...`));
  console.log(chalk`{cyanBright  Author:} {bold.rgb(255,69,0) Hitori.}`);
});

module.exports = app
