const { db } = require("./database");
const { email } = require("./email")

const resetLimit = async () => {
  const users = await db.find({})
  users.forEach(async (data) => {
    const { username } = data
    if (!username == null) {
      return db.updateOne({
        username: username
      }, {
        limit: 10
      }, function (err, res) {
        if (err) throw err
      })
    }
  })
}

const updateExpiredPremium = async (user) => {
  if (user.isPremium && user.premiumTime <= Date.now()) {
    user.isPremium = false;
    user.premiumTime = 0;
    user.role = "Free Account";
    user.apikey = user.defaultKey
    user.limit = 50;
    await user.save();
    const html = await email.htmlNotif(user.username)
    await email.send(user.email, "Trickster API Notifications", html)
    console.log(`Premium expired for user: ${user.username}`);
  }
};

const expiredPremiumUsers = async () => {
  try {
    const users = await db.find({ isPremium: true });

    for (const user of users) {
      await updateExpiredPremium(user);
    }
  } catch (error) {
    console.error(`Error updating expired premium users: ${error}`);
  }
};

const updateExpiredVip = async (user) => {
  if (user.vip && user.premiumTime <= Date.now()) {
    user.vip = false;
    user.premiumTime = 0;
    user.role = "Free Account";
    user.apikey = user.defaultKey
    user.limit = 50;
    await user.save();
    const html = await email.htmlNotif(user.username)
    await email.send(user.email, "Trickster API Notifications", html)
    console.log(`Premium expired for user: ${user.username}`);
  }
};

const expiredVipUsers = async () => {
  try {
    const users = await db.find({ vip: true });

    for (const user of users) {
      await updateExpiredVip(user);
    }
  } catch (error) {
    console.error(`Error updating expired premium users: ${error}`);
  }
};

module.exports = {
	resetLimit,
	updateExpiredPremium,
	expiredPremiumUsers,
	updateExpiredVip,
	expiredVipUsers
}