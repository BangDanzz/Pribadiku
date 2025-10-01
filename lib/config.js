const { db } = require("./database")

const GitHubStrategy = require('passport-github').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');

const config = require("../config")

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

module.exports = function(passport) {
  passport.use(new GoogleStrategy({
    clientID: config.api.google.clientId,
    clientSecret: config.api.google.clientSecret,
    callbackURL: config.api.google.callbackURL,
    passReqToCallback: true 
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const users = await db.findOne({ email: profile.emails[0].value });
      if (users) {
        return done(null, users);
      } else {
        let keys = await randomText(8);
        let key = `htrkey-${keys}`;
        const obj = {
          googleId: profile.id,
          username: profile.displayName,
          email: profile.emails[0].value,
          limit: config.options.limit || 50,
          profile: profile.photos[0].value,
          apikey: key,
          role: "Free Account",
          vvip: "Vip Account",
          isAdmin: false,
          isPremium: false,
          vipTime: 0,
          totalreq: 0,
          since: tanggal(),
          defaultKey: key,
          isVerified: true,
        };

        await db.create(obj);

        // Kirim email pemberitahuan pendaftaran baru
        await sendEmail(obj.email, 'Welcome to Hitori API', `Welcome ${obj.username}! Your Apikey is : ${obj.apikey}`);
        
        return done(null, obj);
      }
    } catch (err) {
      return done(err, false);
    }
  }));

  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  passport.deserializeUser(async function(obj, done) {
    try {
      const user = await db.findById(obj._id);
      done(null, user);
    } catch (err) {
      done(err, false);
    }
  });

  // Fungsi untuk mengirim email
  async function sendEmail(to, subject, text) {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'notreply263@gmail.com', // Email Gmail Anda
        pass: 'aiqripylsaqmokwd'  // Password atau App password dari Gmail
      }
    });

    let info = await transporter.sendMail({
      from: '"Hitori API" <no-reply@hitori.pw>', // Alamat pengirim
      to: to, // Penerima email
      subject: subject, // Subjek email
      text: text, // Isi email dalam format teks
      html: `<p>${text}</p>` // Isi email dalam format HTML
    });

    console.log('Email sent: %s', info.messageId);
  }
}

function randomText (length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let txt = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    txt += characters.charAt(randomIndex);
  }

  return txt;
};


