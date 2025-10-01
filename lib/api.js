const JSONdb = require('simple-json-db');
const path = require('path');
const fs = require("fs");

const apiFilePath = path.join(__dirname, '../router', 'api.js');

const extractEndpointsFromApiFile = () => {
  try {
    const apiContent = fs.readFileSync(apiFilePath, 'utf8');
    const regex = /router\.[a-z]+\(['"]\/([a-zA-Z0-9_/]+)['"]/g;
    const matches = Array.from(apiContent.matchAll(regex), match => '/' + match[1]);
    return matches;
  } catch (error) {
    console.error('Error reading API file:', error.message);
    return [];
  }
};

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("error", "Silahkan Masuk Untuk Memulai Session.");
  res.redirect("/auth/login");
}

const checkPremium = (req, res, next) => {
  if (req.user && (req.user.vip || req.user.isPremium)) {
    next();
  } else {
    req.flash('error', 'Forbidden. Please upgrade to a Premium or VIP account.');
    res.redirect('/users/profile'); 
  }
};


const checkVip = (req, res, next) => {
  if (req.user && req.user.vip) {
    next();
  } else {
    req.flash('error', 'Forbidden. Please Upgrade To Account ');
    res.redirect('/users/profile'); 
  }
};

module.exports = {
  isAuthenticated,
  checkPremium,
  checkVip
}; 
