const axios = require('axios');
// semua settings di sini 
// hallo
const options = {
  own : ["Citra"],
  creator: "Hitori",
  port: 3000,
  limit: 25,
  limitPremium: 1000,
  token: "7171044210:AAHKwdC7pGnLHphh604yXm9wbGH0hwo3DV4",
  chatId: "6206383201",
  webhook: ""
} 
  
module.exports = {
  options, 
  secret: "KaizenAPI2025!",
 
  api: {
    prodia: "",
    openai: "", 
    gemini: "",
    bard:  "",
    google: {
    	clientId: "871368005700-2t0gepacncj811un9oupdrlmptg8ddtg.apps.googleusercontent.com",
    	clientSecret: "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",
    	callbackURL: "http://api.hitori.pw/auth/google/callback"
    }, 
    spotify: {
    	clientId: "",
    	clientSecret: ""
    },
    bing: []
  },
  
  smtp: {
  	email: 'notreply263@gmail.com',
    pass: 'edxoqbtzvcyatunz'
  },
  
  mongoURL: "mongodb+srv://notreply263:kaizenapis123@kaizenapi.wgbyfos.mongodb.net/mydatabase?retryWrites=true&w=majority&appName=KaizenAPI",
  message: async (text, mode) => {
  	try {
  		const { data } = await axios.post(`https://api.telegram.org/bot${options.token}/sendMessage`, {
  			chat_id: options.chatId,
  			text: text,
  			parse_mode: mode
          })
          
          console.log(data.ok)
      } catch (e) {
      	console.error(e)
      }
  },
  
  web: {
    title: "Hitori API", 
    footer: "Copyright © 2024 Hitori.",
    tags: {
      "anime": "fas fa-ghost", 	
      "download": "fas fa-download",
      "ai": "fas fa-robot",
      "stalker": "fas fa-eye",
    },
  },
  
  msg: {
    query: {
      status: 403,
      creator: options.creator,
      message: "Masukan Parameter Query."
    },
    text: {
      status: 403,
      creator: options.creator,
      message: "Masukan Parameter Text."
    },
    param: {
      status: 403,
      creator: options.creator,
      message: "Parameter Invalid, silahkan cek lagi."
    },
    url: {
      status: 403,
      creator: options.creator,
      message: "Masukan Parameter URL."
    },
    user: {
      status: 403,
      creator: options.creator,
      message: "Masukan Parameter User Name."
    },
    id: {
      status: 403,
      creator: options.creator,
      message: "Masukan Parameter ID."
    },
    error: {
      status: 403,
      creator: options.creator,
      message: "Terjadi Kesalahan Saat Mengambil data."
    }
  }
}
