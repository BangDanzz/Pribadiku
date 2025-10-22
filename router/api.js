const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const multer = require("multer");
const CryptoJS = require("crypto-js");
const crypto = require('crypto');
const https = require("https");
const fs = require("fs");
const FormData = require('form-data');
const ws = require("ws");
const WebSocket = require("ws");
const path = require('path');
const qs = require("qs");
const { v4: uuidv4 } = require('uuid');
const os = require("os");
const fileType = require("file-type");
const request = require('request');
const fetch = require('node-fetch'); 
const { Readable } = require('stream');
const bodyParser = require('body-parser');
const got = require('got');
const EventSource = require("eventsource");
const { generateFakeChatIphone } = require("generator-fake");

const router = express.Router();
const config = require("../config");
const Function = require("../lib/function");
const { db } = require("../lib/database");

const Func = new Function();
const upload = multer();

const { resSukses, resValid, deleteFile } = Func;

const checkApiKeys = async (req, res, next) => {
  // Abaikan preflight OPTIONS (CORS) agar limit tidak double
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.query.apikey;

  // Gunakan IP asli user dari header x-forwarded-for, fallback ke remoteAddress
  const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper update log
  const updateLog = async (status, increment = true) => {
    const incFields = increment ? { 'logs.$.totalRequests': 1, 'logs.$.todayRequests': 1 } : {};
    let result = await db.findOneAndUpdate(
      { apikey: apiKey, 'logs.ip': ipAddress, 'logs.date': { $gte: today } },
      { 
        $inc: incFields,
        $set: { 'logs.$.status': status, date: new Date() }
      },
      { new: true }
    );

    if (!result) {
      result = await db.findOneAndUpdate(
        { apikey: apiKey },
        { $push: { logs: { ip: ipAddress, totalRequests: increment ? 1 : 0, todayRequests: increment ? 1 : 0, status, date: new Date() } } },
        { upsert: true, new: true }
      );
    }
    return result;
  };

  if (!apiKey) {
    await updateLog('invalidKey', true);
    return res.status(401).json(resValid("Masukan Parameter Apikey."));
  }

  try {
    const user = await db.findOne({ apikey: apiKey });

    if (!user) {
      await updateLog('invalidKey', true);
      return res.status(403).json(resValid(`Apikey ${apiKey} not Found`));
    }

    const isNonPremium = !user.isPremium && !user.vip;

    if (isNonPremium) {
      if (user.limit > 0) {
        user.limit -= 1;
        await user.save();

        await updateLog('success', true);
      } else {
        await updateLog('limit', false); // jangan increment
        return res.status(429).json(resValid("Limit kamu sudah habis."));
      }
    } else {
      await updateLog('success', true);
    }

    req.apiKeyData = user;
    req.isPremium = user.isPremium;
    req.vip = user.vip;

    next();
  } catch (error) {
    console.error('Error checking API key:', error);
    await updateLog('error', true);
    res.status(500).json(config.msg.error);
  }
};

async function cekPrem(req, res, next) {
  var apikey = req.query.apikey
  if (!apikey) return res.json({ status: false, message: "Please enter apikey parameters" })

  let user = await db.findOne({ apikey: apikey });
  if (user === null) {
    return res.json({ status: false, message: `Apikey ${apikey} not found` })
  } else if (!user.isPremium) {
    return res.json({ status: false, message: "Akun Anda Belum Premium Tidak Dapat Menggunakan Fitur Ini" })
  } else {
    return next();
  }
}

async function cekVip(req, res, next) {
  var apikey = req.query.apikey
  if (!apikey) return res.json({ status: false, message: "Please enter apikey parameters" })

  let user = await db.findOne({ apikey: apikey });
  if (user === null) {
    return res.json({ status: false, message: `Apikey ${apikey} not found` })
  } else if (!user.vip && !user.isPremium) {
    return res.json({ status: false, message: "Akun Anda Belum VIP/Premium Tidak Dapat Menggunakan Fitur Ini" })
  } else {
    return next();
  }
}

async function snapinsDownload(instaUrl) {
  const headers = {
    accept: "*/*",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/x-www-form-urlencoded",
    "sec-ch-ua": "\"Chromium\";v=\"137\", \"Not/A)Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    cookie: "_ga=GA1.1.941270094.1750116010; __gads=ID=3b3c61a16bf2d64d:T=1750116012:RT=1752227818:S=ALNI_MY1uzRZ4462w8_G-YaRxBXtqWjWnQ; __gpi=UID=00001130a9ec8056:T=1750116012:RT=1752227818:S=ALNI_MatpCnQPJ1G7Pd-OTEBMpRprgPRFA; __eoi=ID=b05362571ec72ad0:T=1750116012:RT=1752227818:S=AA-Afja4fIJWHvHjvIiisjR23Bl2; _ga_88MHXBELKK=GS2.1.s1752227814$o3$g1$t1752227825$j49$l0$h0",
    Referer: "https://snapins.ai/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };

  const body = qs.stringify({ url: instaUrl });

  try {
    const res = await axios.post("https://snapins.ai/action.php", body, { headers });
    return res.data;
  } catch (err) {
    return {
      success: false,
      status: err.response?.status || 500,
      error: err.message,
      detail: err.response?.data || null
    };
  }
}

async function char(user = "user", charid, message) {
    try {
        if (!charid) throw new Error("Character ID is required.");
        if (!message) throw new Error("Message cannot be empty.");

        const { CAINode } = await import("cainode");
        const client = new CAINode();

        // Login ke Character AI
        await client.login("d6536ea3db3612ca0342edd09371c1b1a6e30fdd");

        // Pastikan karakter valid dan dapat dihubungkan
        const character_id = String(charid).trim();
        if (!character_id) throw new Error("Invalid character ID format.");

        if (!client.character || typeof client.character.connect !== "function") {
            throw new Error("Client.character not initialized properly.");
        }

        // Hubungkan karakter
        await client.character.connect(character_id);

        // Kirim pesan ke karakter
        const safeMessage = message.toString().trim();
        const sendMessage = await client.character.send_message(`${user}: ${safeMessage}`, true, "");

        // Pastikan pesan berhasil dikirim
        if (!sendMessage) throw new Error("Failed to send message to character.");

        // Dapatkan respon karakter
        const response = await client.character.generate_turn();

        // Logout agar sesi bersih
        await client.logout();

        // Proses dan bersihkan respon
        const candidate = response?.turn?.candidates?.[0]?.raw_content;
        if (!candidate) throw new Error("No valid response from character.");

        const cleanedResponse = candidate
            .replace(/[*_~`]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        if (!cleanedResponse) throw new Error("Response content is empty.");

        return cleanedResponse;

    } catch (error) {
        return { error: `Message Error: ${error.message}` };
    }
}

async function threads(url) {
  try {
    const { data } = await axios.get(`https://api.threadsphotodownloader.com/v2/media?url=${url}`)
    return data
  } catch (err) {
    return String(err)
  }
}

async function krakenFiles(url) {
  try {
    const res = await axios({
      url
    });

    if (res.status !== 200) {
      throw new Error(res.statusText);
    }
    
    const $ = cheerio.load(res.data);
    
    const result = {
          title: $(".coin-name h5").text().trim(),
          uploaddate: $(".nk-iv-wg4-overview li:nth-child(1) .lead-text").text().trim(),
          lastdownloaddate: $(".nk-iv-wg4-overview li:nth-child(2) .lead-text").text().trim(),
          filesize: $(".nk-iv-wg4-overview li:nth-child(3) .lead-text").text().trim(),
          type: $(".nk-iv-wg4-overview li:nth-child(4) .lead-text").text().trim(),
          views: $(".views-count").text().trim().slice(5),
          downloads: $(".downloads-count strong").text().trim(),
          fileHash: $(".general-information").attr("data-file-hash")
    };

    return result;
  } catch (err) {
    throw err;
  }
};

class TikVid {
  constructor() {
    this.link = "https://tikvid.io";
    this.regex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@[\w.-]+\/video\/\d+|vm\.tiktok\.com\/\w+|vt\.tiktok\.com\/\w+)/;
    this.headers = {
      accept: "*/*",
      "accept-language": "id-MM,id;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://tikvid.io",
      referer: "https://tikvid.io/",
      "user-agent": "Postify/1.0.0"
    };
  }
  async convert(vid, audio, image, exp, token, url) {
    const params = new URLSearchParams({
      ftype: "mp4",
      v_id: vid,
      audioUrl: audio,
      audioType: "audio/mp3",
      imageUrl: image,
      fquality: "1080p",
      fname: "TikVid.io",
      exp: exp,
      token: token
    });
    try {
      const {
        data
      } = await axios.post(url, params, {
        headers: this.headers
      });
      return data;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  job(jobId) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://s2.tik-cdn.com/sub/${jobId}?fname=TikVid.io`, {
        headers: {
          Origin: "https://tikvid.io",
          "User-Agent": this.headers["user-agent"]
        }
      });
      ws.on("message", data => {
        const message = JSON.parse(data);
        if (message.action === "success") {
          ws.close();
          resolve(message);
        }
      });
      ws.on("error", error => {
        console.error(error);
        reject(error);
      });
      setTimeout(() => {
        ws.close();
        reject(new Error("Proses konversi gambar slide gagal, coba lagi nanti."));
      }, 12e4);
    });
  }
  async download(url) {
    if (!this.regex.test(url)) return {
      error: "Link TikTok tidak valid. Coba gunakan link TikTok yang lain."
    };
    try {
      const {
        data
      } = await axios.post(`${this.link}/api/ajaxSearch`, new URLSearchParams({
        q: url,
        lang: "en"
      }), {
        headers: this.headers
      });
      const $ = cheerio.load(data.data);
      const result = {
        title: $(".tik-video .content h3").text().trim(),
        thumbnail: $(".image-tik img").attr("src"),
        downloads: {
          video: {},
          images: [],
          audio: null
        }
      };
      $(".dl-action a").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        const text = $el.text().trim().toLowerCase();
        if (href && !href.includes("javascript:void(0);")) {
          if (text.includes("mp4")) {
            if (text.includes("hd")) result.downloads.video.hd = href;
            else if (text.includes("[1]")) result.downloads.video.nowm = href;
            else if (text.includes("[2]")) result.downloads.video.wm = href;
          } else if (text.includes("mp3")) result.downloads.audio = href;
        }
      });
      result.downloads.video.source = $("#vid").attr("data-src");
      result.tiktokId = $("#TikTokId").val();
      const sc = $("script").last().html();
      const [, exp] = sc.match(/k_exp\s*=\s*"(\d+)"/) || [];
      const [, token] = sc.match(/k_token\s*=\s*"([a-f0-9]+)"/) || [];
      const [, convertUrl] = sc.match(/k_url_convert\s*=\s*"([^"]+)"/) || [];
      if (exp && token && convertUrl) result.convert = {
        exp: exp,
        token: token,
        convertUrl: convertUrl
      };
      $(".photo-list .download-items").each((_, item) => {
        const $item = $(item);
        result.downloads.images.push({
          thumbnail: $item.find("img").attr("src"),
          dlink: $item.find("a").attr("href")
        });
      });
      if (result.downloads.images.length > 1) {
        const $convertButton = $("#ConvertToVideo");
        if ($convertButton.length) {
          const audio = $convertButton.attr("data-audiourl");
          const imageData = $convertButton.attr("data-imagedata");
          if (result.tiktokId && audio && imageData && result.convert) {
            result.slides = await this.convert(result.tiktokId, audio, imageData, result.convert.exp, result.convert.token, result.convert.convertUrl);
            if (result.slides?.jobId) {
              try {
                result.convertComplete = await this.job(result.slides.jobId);
                result.downloads.video.converted = result.convertComplete.url;
              } catch (error) {
                console.error(error);
                result.error = "Proses konversi gambar slide gagal, coba lagi nanti.";
              }
            }
          }
        }
      }
      if (!Object.keys(result.downloads.video).length) result.downloads.video = null;
      if (!result.downloads.images.length) result.downloads.images = null;
      return result;
    } catch (error) {
      return {
        error: "Terjadi kesalahan. Coba lagi beberapa saat lagi."
      };
    }
  }
}

async function dlPanda(url) {
  try {
    const response = await fetch(
      `https://dlpanda.com/en?url=${encodeURIComponent(url)}&t0ken=b8b6c49aToTA`
    );
    const html = await response.text();
    const $ = cheerio.load(html);

    const results = {
      image: [],
      video: []
    };

    // ambil video / image
    $("div.hero.col-md-12.col-lg-12.pl-0.pr-0 img, div.hero.col-md-12.col-lg-12.pl-0.pr-0 video").each(function () {
      const element = $(this);
      const isVideo = element.is("video");

      // kalau video -> ambil dari <source>
      let src = isVideo ? element.find("source").attr("src") : element.attr("src");
      if (!src) return; // skip kalau kosong

      // tambah protokol kalau url diawali //
      const fullSrc = src.startsWith("//") ? "https:" + src : src;

      results[isVideo ? "video" : "image"].push({
        src: fullSrc,
        width: element.attr("width") || null,
        ...(isVideo
          ? {
              type: element.find("source").attr("type") || null,
              controls: element.attr("controls") || null,
              style: element.attr("style") || null
            }
          : {})
      });
    });

    return results;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}


const FIGURE_PROMPT = "Using the nano-banana model, a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.";
class AIGenerator {
  constructor() {
    this.config = {
      baseURL: "https://veo3-backend-alpha.vercel.app/api",
      endpoints: {
        login: "/v1/user/login",
        chat: "/v1/chat",
        uploadImages: "/v1/chat/upload-images",
        chatPoll: "/v1/chat/poll/status/"
      },
      defaultLoginPayload: {
        build: "1.2.1",
        country: "US",
        language: "en",
        platform: "Android",
        version: "1.2.1",
        osVersion: "33",
        timeZone: "America/Los_Angeles"
      }
    };
    this.token = null;
  }
  _generateRandomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  _createLoginData() {
    const randomId = this._generateRandomString(21);
    return {
      ...this.config.defaultLoginPayload,
      googleAccountId: `10${randomId}`,
      email: `user.${this._generateRandomString(5)}@example.com`,
      displayName: `User ${this._generateRandomString(5)}`,
      deviceId: `device_${this._generateRandomString(16)}`,
      deviceModel: `SDK_${this._generateRandomString(4)}`
    };
  }
  _buildHeaders() {
    if (!this.token) {
      throw new Error("Token tidak tersedia. Silakan login terlebih dahulu.");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`
    };
  }
  async _login() {
    console.log("PROSES: Mencoba untuk login...");
    try {
      const response = await axios.post(`${this.config.baseURL}${this.config.endpoints.login}`, this._createLoginData());
      if (response.data && response.data.token) {
        this.token = response.data.token;
        console.log("SUKSES: Login berhasil dan token diterima.");
      } else {
        throw new Error("Respons login tidak valid atau tidak mengandung token.");
      }
    } catch (error) {
      console.error("GAGAL: Terjadi kesalahan saat login.", error.response ? error.response.data : error.message);
      throw error;
    }
  }
  async _ensureLogin() {
    if (!this.token) {
      console.log("LOG: Token tidak ditemukan, menjalankan proses login...");
      await this._login();
    }
  }
  async _uploadFile(file) {
    console.log(`PROSES: Memulai proses unggah untuk ${file.fileName}...`);
    try {
      console.log(` -> Meminta izin unggah...`);
      const presignResponse = await axios.post(`${this.config.baseURL}${this.config.endpoints.uploadImages}`, {
        images: [{
          fileName: file.fileName,
          fileType: file.fileType
        }]
      }, {
        headers: this._buildHeaders()
      });
      const uploadInfo = presignResponse.data.data[0];
      if (!uploadInfo || !uploadInfo.uploadUrl) {
        throw new Error("Gagal mendapatkan URL pre-signed dari server.");
      }
      console.log(` -> SUKSES: URL pre-signed diterima.`);
      console.log(` -> Mengunggah data file...`);
      await axios.put(uploadInfo.uploadUrl, file.data, {
        headers: {
          "Content-Type": file.fileType
        }
      });
      console.log(`SUKSES: Unggah untuk ${file.fileName} berhasil.`);
      return uploadInfo.fileUrl;
    } catch (error) {
      console.error(`GAGAL: Terjadi kesalahan saat mengunggah ${file.fileName}.`, error.response ? error.response.data : error.message);
      throw error;
    }
  }
  async _pollStatus(requestId) {
    console.log(`PROSES: Memulai polling untuk requestId: ${requestId}...`);
    const pollUrl = `${this.config.baseURL}${this.config.endpoints.chatPoll}${requestId}`;
    while (true) {
      try {
        const {
          data
        } = await axios.get(pollUrl, {
          headers: this._buildHeaders()
        });
        if (data.isCompleted) {
          console.log("SUKSES: Tugas telah selesai.");
          return data;
        }
        console.log("LOG: Status tugas belum selesai. Menunggu 3 detik sebelum mencoba lagi...");
      } catch (error) {
        console.error("GAGAL: Terjadi kesalahan saat polling status.", error.response ? error.response.data : error.message);
      }
      await new Promise(resolve => setTimeout(resolve, 3e3));
    }
  }
  async generate({
    prompt = FIGURE_PROMPT,
    imageUrl,
    ...rest
  }) {
    console.log("PROSES: Memulai alur kerja generate...");
    try {
      if (!prompt) {
        throw new Error("Parameter `prompt` wajib diisi.");
      }
      await this._ensureLogin();
      const imageArray = imageUrl ? Array.isArray(imageUrl) ? imageUrl : [imageUrl] : [];
      const finalImageUrls = [];
      if (imageArray.length > 0) {
        console.log(`LOG: Memproses ${imageArray.length} gambar...`);
        for (const image of imageArray) {
          let processedUrl;
          if (typeof image === "string" && image.startsWith("http")) {
            console.log(" -> Mendeteksi URL, menambahkannya secara langsung.");
            processedUrl = image;
          } else if (typeof image === "string" && image.startsWith("data:")) {
            console.log(" -> Mendeteksi data Base64, memproses untuk diunggah...");
            const match = image.match(/^data:(.+);base64,(.*)$/);
            if (!match) throw new Error("Format string Base64 tidak valid.");
            const [, fileType, data] = match;
            const extension = fileType.split("/")[1] || "bin";
            processedUrl = await this._uploadFile({
              fileName: `upload.${extension}`,
              fileType: fileType,
              data: Buffer.from(data, "base64")
            });
          } else if (typeof image === "object" && image.data instanceof Buffer) {
            console.log(` -> Mendeteksi Buffer untuk file "${image.fileName}", memproses untuk diunggah...`);
            if (!image.fileType || !image.fileName) {
              throw new Error("Objek gambar Buffer harus memiliki properti `fileType` dan `fileName`.");
            }
            processedUrl = await this._uploadFile(image);
          } else {
            throw new Error(`Format gambar tidak didukung untuk item: ${JSON.stringify(image)}`);
          }
          finalImageUrls.push(processedUrl);
        }
      }
      const chatData = {
        prompt: prompt,
        imageUrls: finalImageUrls,
        ...rest
      };
      console.log("PROSES: Mengirim permintaan tugas final dengan data:", chatData);
      const initialResponse = await axios.post(`${this.config.baseURL}${this.config.endpoints.chat}`, chatData, {
        headers: this._buildHeaders()
      });
      if (initialResponse.data && initialResponse.data.requestId) {
        console.log(`SUKSES: Permintaan tugas diterima dengan requestId: ${initialResponse.data.requestId}.`);
        return await this._pollStatus(initialResponse.data.requestId);
      } else {
        throw new Error("Respons dari server tidak mengandung requestId.");
      }
    } catch (error) {
      console.error("GAGAL: Terjadi kesalahan besar pada proses generate.", error.message);
      return null;
    }
  }
}

const ghibli = {
  api: {
    base: 'https://api.code12.cloud',
    endpoints: {
      paygate: (slug) => `/app/paygate-oauth${slug}`,
      ghibli: (slug) => `/app/v2/ghibli/user-image${slug}`,
    },
  },

  creds: {
    appId: 'DKTECH_GHIBLI_Dktechinc',
    secretKey: 'r0R5EKF4seRwqUIB8gLPdFvNmPm8rN63',
  },

  studios: [
    'ghibli-howl-moving-castle-anime',
    'ghibli-spirited-away-anime',
    'ghibli-my-neighbor-totoro-anime',
    'ghibli-ponyo-anime',
    'ghibli-grave-of-fireflies-anime',
    'ghibli-princess-mononoke-anime',
    'ghibli-kaguya-anime',
  ],

  headers: {
    'user-agent': 'NB Android/1.0.0',
    'accept-encoding': 'gzip',
  },

  db: './db.json',

  log: (...args) => console.log(...args),

  readDB: () => {
    try {
      return JSON.parse(fs.readFileSync(ghibli.db, 'utf-8'));
    } catch {
      return null;
    }
  },

  writeDB: (data) => fs.writeFileSync(ghibli.db, JSON.stringify(data, null, 2), 'utf-8'),

  getStudioId: (id) => {
    if (typeof id === 'number' && ghibli.studios[id]) return ghibli.studios[id];
    if (typeof id === 'string' && ghibli.studios.includes(id)) return id;
    return null;
  },

  getNewToken: async () => {
    try {
      const url = `${ghibli.api.base}${ghibli.api.endpoints.paygate('/token')}`;

      const res = await axios.post(
        url,
        { 
            appId: ghibli.creds.appId, 
            secretKey: ghibli.creds.secretKey 
          },
       {
          headers: { 
            ...ghibli.headers, 
            'content-type': 'application/json'
        },
          validateStatus: () => true,
        }
      );

      if (res.status !== 200 || res.data?.status?.code !== '200') {
        return {
          success: false,
          code: res.status || 500,
          result: { 
            error: res.data?.status?.message || 'Gagal ambil tokennya bree 😂' 
          },
        };
      }

      const { token, tokenExpire, encryptionKey } = res.data.data;
      ghibli.writeDB({ token, tokenExpire, encryptionKey });

      return { 
        success: true, 
        code: 200, 
        result: { 
            token, 
            tokenExpire, 
            encryptionKey
       }
     };
    } catch (err) {
      return { success: false, code: err?.response?.status || 500, result: { error: err.message } };
    }
  },

  getToken: async () => {
    const db = ghibli.readDB();
    const now = Date.now();

    if (db && db.token && db.tokenExpire && now < db.tokenExpire) {
      ghibli.log('✅ Pake token dari db yak bree... 🥴');
      return { 
        success: true, 
        code: 200, 
        result: db 
      };
    }

    ghibli.log('♻️ Tokennya expired atau kosong bree... otewe bikin token baru ye gasih 😂');
    return await ghibli.getNewToken();
  },

  generate: async ({ studio, filePath }) => {
    const studioId = ghibli.getStudioId(studio);
    if (!studioId) {
      return {
        success: false,
        code: 400,
        result: {
          error: `Studionya kudu pake index (0-${ghibli.studios.length - 1}) yak bree 🗿\n• Daftar: ${ghibli.studios.map((id, i) => `[${i}] ${id}`).join(', ')}`,
        },
      };
    }

    if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
      return {
        success: false,
        code: 400,
        result: { 
            error: 'Imagenya kagak boleh kosong 🗿'
         },
      };
    }

    try {
      const toket = await ghibli.getToken();
      if (!toket.success) return toket;

      const { token } = toket.result;

      const form = new FormData();
      form.append('studio', studioId);
      form.append('file', fs.createReadStream(filePath), {
        filename: filePath.split('/').pop(),
        contentType: 'image/jpeg',
      });

      const url = `${ghibli.api.base}${ghibli.api.endpoints.ghibli('/edit-theme')}?uuid=1212`;

      const res = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
          ...ghibli.headers,
          authorization: `Bearer ${token}`,
        },
        validateStatus: () => true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (res.status !== 200 || res.data?.status?.code !== '200') {
        return {
          success: false,
          code: res.status || 500,
          result: { 
            error: res.data?.status?.message || res.data?.message || `${res.status}`
          },
        };
      }

      const { imageId, imageUrl, imageOriginalLink } = res.data.data;
      return { 
        result: { 
            download: imageUrl
        }
      };
    } catch (err) {
      return { 
        success: false, 
        code: err?.response?.status || 500, 
        result: { 
            error: err.message
        }
     };
    }
  },
};

const imagen = {
  api: {
    base: 'https://image.pollinations.ai',
    endpoints: {
      textToImage: (prompt, width, height, seed) =>
        `/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&safe=true&seed=${seed}`
    }
  },

  headers: {
    'user-agent': 'NB Android/1.0.0',
    accept: 'image/jpeg',
    Authorization: 'Bearer Vxbsp6f84MqPzLgK',
    referer: 'https://image.pollinations.ai/'
  },

  request: (prompt, type, negative, size) => {
    const stylePrompts = {
      'No Style': '{prompt}',
      Realistic: 'realistic photo {prompt}. highly detailed, high budget, highly details, epic, high quality',
      Ghibli: 'style of studio ghibli, Hayao Miyazaki style',
      GTA: 'GTA style {prompt}. Realistic gta art style, rockstar games artwork, vice city, photorealistic concept art, detailed face, realistic anatomy, epic, cinematic, high detail, highly detailed, 4k RAW',
      Anime: 'anime style {prompt}. key visual, vibrant, studio anime, highly detailed',
      Cinematic: 'cinematic still {prompt}. emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, epic, gorgeous, film grain, grainy',
      Photographic: 'cinematic photo {prompt}. 35mm photograph, film, bokeh, professional, 4k, highly detailed',
      Fantasy: 'ethereal fantasy concept art of {prompt}. magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy',
      Cartoon: 'cartoon style {prompt}. cartoon, vibrant, high-energy, detailed',
      Cyberpunk: 'cyberpunk style {prompt}. extremely detailed, photorealistic, 8k, realistic, neon ambiance, vibrant, high-energy, cyber, futuristic',
      Manga: 'manga style {prompt}. vibrant, high-energy, detailed, iconic, Japanese comic style',
      'Digital Art': 'concept art {prompt}. digital artwork, illustrative, painterly, matte painting, highly detailed',
      Colorful: 'colorful style {prompt}. color, vibrant, high-energy, detailed, cover art, dreamy',
      Robot: 'robotic style {prompt}. robotic, vibrant, high-energy, detailed, cyber, futuristic',
      Neonpunk: 'neonpunk style {prompt}. cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern, magenta highlights, dark purple shadows, high contrast, cinematic, ultra detailed, intricate, professional',
      'Pixel Art': 'pixel-art style {prompt}. low-res, blocky, 8-bit graphics, 16-bit, pixel',
      Disney: 'disney style {prompt}. disney cartoon, vibrant, high-energy, detailed, 3d, disney styles',
      '3D Model': 'professional 3d model {prompt}. octane render, highly detailed, volumetric, dramatic lighting',
    };

    const negativePrompts = {
      'No Style': 'extra hand, extra legs, ugly, glitch, bad eyes, low quality face, text, glitch, deformed, mutated, ugly, disfigured',
      Realistic: 'anime, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured',
      Ghibli: '-',
      GTA: 'ugly, deformed, noisy, blurry, anime, cartoon, distorted, out of focus, bad anatomy, extra limbs, poorly drawn face, poorly drawn hands, missing fingers',
      Anime: 'photo, deformed, black and white, realism, disfigured, low contrast',
      Cinematic: 'anime, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured',
      Photographic: 'drawing, painting, crayon, sketch, graphite, impressionist, noisy, blurry, soft, deformed, ugly',
      Fantasy: 'photographic, realis, realism, 35mm film, dslr, cropped, frame, text, deformed, glitch, noise, noisy, off-center, deformed, cross-eyed, closed eyes, bad anatomy, ugly, disfigured, sloppy, duplicate, mutated, black and white',
      Cartoon: 'ugly, deformed, noisy, blurry, low contrast, realism, photorealistic',
      Cyberpunk: 'anime, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured',
      Manga: 'ugly, deformed, noisy, blurry, low contrast, realism, photorealistic, Western comic style',
      'Digital Art': 'photo, photorealistic, realism, ugly',
      Colorful: 'graphic, text, painting, crayon, graphite, glitch, deformed, mutated, ugly, disfigured',
      Robot: 'anime, cartoon, text, painting, crayon, graphite, glitch, deformed, mutated, ugly, disfigured',
      Neonpunk: 'painting, drawing, illustration, glitch, deformed, mutated, cross-eyed, ugly, disfigured',
      'Pixel Art': 'sloppy, messy, blurry, noisy, highly detailed, ultra textured, photo, realistic',
      Disney: 'graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured',
      '3D Model': 'ugly, deformed, noisy, low poly, blurry, painting',
    };

    const extraPrompt = (stylePrompts[type] || '{prompt}').replace('{prompt}', prompt);
    const fullNegative = `${negative}, ${negativePrompts[type] || ''}, nude, nudity, naked, sfw, nsfw, sex, erotic, pornography, hentai, explicit, fetish, bdsm, orgy, masturbate, masturbation, genital, vagina, penis, nipples, nipple, intercourse, ejaculation, orgasm, cunt, boobs, ****, tits, breast, ass, topless, fisting, censored`;

    let dimensions;
    switch (size) {
      case '3:4':
        dimensions = [864, 1152];
        break;
      case '4:3':
        dimensions = [1152, 864];
        break;
      case '16:9':
        dimensions = [1366, 768];
        break;
      case '9:16':
        dimensions = [768, 1366];
        break;
      default:
        dimensions = [1024, 1024];
    }

    return { extraPrompt, negative: fullNegative, dimensions };
  },

  generate: async (prompt = '', type = 'No Style', negative = '', size = '1:1') => {
    if (!prompt?.trim()) {
      return {
        success: false,
        code: 400,
        result: { error: 'Wheres the prompt? Its actually empty like this... ' }
      };
    }

    try {
      const { extraPrompt, negative: fullNegative, dimensions } = imagen.request(prompt, type, negative, size);
      const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const url = `${imagen.api.base}${imagen.api.endpoints.textToImage(`${extraPrompt}, ${prompt}`, dimensions[0], dimensions[1], seed)}`;

      const { data } = await axios.get(url, {
        headers: imagen.headers,
        timeout: 60000,
        responseType: 'arraybuffer'
      });

      if (!data || data.length === 0) {
        return {
          success: false,
          code: 404,
          result: { error: 'Theres no response' }
        };
      }

      return {
        result: {
          url,
          type
        }
      };
    } catch (error) {
      return {
        success: false,
        code: error?.response?.status || 500,
        result: { error: 'Error' }
      };
    }
  }
};

async function douyin(url) {
  const config = {
    method: 'post',
    url: 'https://savetik.co/api/ajaxSearch',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest'
    },
    data: `q=${url}&lang=en`
  };

  try {
    const { data } = await axios(config);
    const $ = cheerio.load(data.data);
    let urls = [];
    let media;
    let result = {
     slide: false,
      status: 200,
      media: media
    };

    $('a:contains("Download Photo")').each((index, element) => {
      const url = $(element).attr('href');
      urls.push(url);
    });

    if (urls.length === 0) {
      media = {};
      media = {
        mp4_1: $('a:contains("Download MP4 [1]")').attr('href'),
        mp4_2: $('a:contains("Download MP4 [2]")').attr('href'),
        mp4_hd: $('a:contains("Download MP4 HD")').attr('href'),
        mp3: $('a:contains("Download MP3")').attr('href')
      };
     result.slide = false
      result.media = media;
    } else {
      result.slide = true
      result.media = urls;
    }

    return result;
  } catch (error) {
    console.error(error);
    return { status: 500, error: error.message };
  }
}

async function fetchData(url, languageId) {
    try {
      const response = await axios.post("https://ttsave.app/download", {
        query: url,
        language_id: languageId
      }, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json"
        }
      });
      return cheerio.load(response.data);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async function pptiktok(user) {
    const $ = await fetchData(user, "1");
    return {
      username: $("#unique-id").val(),
      name: $("h2").text().trim(),
      thumbnail: $('a[target="_blank"] img').attr("src"),
      download: $('a[target="_blank"]').attr("href")
    };
  }
//pptiktok("peliniseveline")

async function dlSSSTikTokProfile(username) {
  try {
    const form = new FormData();
    form.append("_token", "RlU37dM1IJPUOn2abeoug0RBbLj5CrnAp9K77ZqN"); // ⚠️ token harus valid
    form.append("magicTik", username);
    form.append("fileformat", "dp");

    const { data } = await axios.post("https://www.ssstiktokr.com/tik", form, {
      headers: {
        ...form.getHeaders(),
        "accept": "application/json, text/javascript, */*; q=0.01",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "https://www.ssstiktokr.com",
        "referer": "https://www.ssstiktokr.com/profile-pic",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    return data; // hasil JSON dari server
  } catch (err) {
    return { error: err.message };
  }
}

async function getTikTokProfileInfo(username) {
  const result = await dlSSSTikTokProfile(username);

  if (result?.tik?.data) {
    const user = result.tik.data.user;
    const stats = result.tik.data.statsV2 || result.tik.data.stats;

    return {
      username: user.uniqueId,
      name: user.nickname,
      thumbnail: user.avatarThumb,
      download: user.avatarLarger,
      bio: user.signature,
      verified: user.verified,
      privateAccount: user.privateAccount,
      banned: user.isEmbedBanned
    };
  }

  return { error: "Data tidak ditemukan" };
}

async function vehicle(query) {
  try {
    const response = await axios.get("https://app.mofe.co.id/api/v1/products", {
      params: {
        page: 1,
        query: query
      },
      headers: {
        "accept": "*/*",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "sec-ch-ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Linux\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "Referer": "https://www.mofe.co.id/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });

    const products = response.data.data.map(item => ({
      title: item.title,
      price: item.price,
      city: item.city,
      published_at: item.published_at,
      created_at: item.created_at,
      model: item.model,
      color: item.color,
      vehicle_image_primary: item.vehicle_image_primary
    }));

    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
  }
}

//vehicle('yamaha');

async function olx(query) {
  try {
    const response = await axios.get(`https://www.olx.co.id/api/relevance/v4/search?facet_limit=100&location=4000030&location_facet_limit=20&platform=web-mobile&query=${query}&relaxedFilters=true&spellcheck=true&user=192f32dbf02x26e3710b`, {
      headers: {
        "accept": "*/*",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "newrelic": "eyJ2IjpbMCwxXSwiZCI6eyJ0eSI6IkJyb3dzZXIiLCJhYyI6IjM5ODM1MDciLCJhcCI6IjE4MzQ5OTkzOTYiLCJpZCI6IjE0YjNmMGEwMGJmODAzNTEiLCJ0ciI6IjkyOGU3OGM3NzQ1M2NkNDZmZTVjOWE5NDQ1NWRjMmFjIiwidGkiOjE3MzA2NTY3ODQyMzQsInRrIjoiMjA0MjYwNyJ9fQ==",
        "sec-ch-ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Linux\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "traceparent": "00-928e78c77453cd46fe5c9a94455dc2ac-14b3f0a00bf80351-01",
        "tracestate": "2042607@nr=0-1-3983507-1834999396-14b3f0a00bf80351----1730656784234",
        "x-newrelic-id": "Vw8PUlNTDxABUlZVDggCVFUJ",
        "x-panamera-fingerprint": "b7b1ead087c8aa2581c4b48f66704c34#1730656723412",
        "Referer": "https://www.olx.co.id/jakarta-selatan_g4000030/q-Pajero",
        "Referrer-Policy": "no-referrer-when-downgrade"
      }
    });

    const results = response.data.data.map(item => ({
      title: item.title,
      harga: item.price.value.display,
      description: item.description ? item.description.replace(/\n+/g, '').trim() : null,
      image: item.images ? item.images[0].url : null,
      lokasi: item.locations_resolved.ADMIN_LEVEL_1_name
    }));

    return results;
  } catch (error) {
    return error.response ? error.response.data : error.message;
  }
}

//olx()

async function smule(arg) {
    if (typeof arg !== 'string') {
        return Promise.reject(new Error('URL required!'));
    }

    return got(arg).then(res => {
        const body = res.body;
        const streamUrl = body.split(`twitter:player:stream" content="`)[1].split('">')[0].replace(/amp;/g, '');
        const titleMatch = body.match(/<meta property="og:title" content="([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : 'undedined';

        const descriptionMatch = body.match(/<meta property="og:description" content="([^"]+)"/);
        const description = descriptionMatch ? descriptionMatch[1] : 'undefined';
        const imageMatch = body.match(/<meta property="og:image" content="([^"]+)"/);
        const imageUrl = imageMatch ? imageMatch[1] : 'undefined';

        return {
            title: title,
            description: description,
            image: imageUrl,
            streamUrl: streamUrl
        };
    }).catch(err => {
        if (err && err.code === 404) {
            err.message = 'Error';
        }
        return err.message;
    });
}

//smule("https://www.smule.com/recording/noah-menghapus-jejakmu/1411828004_2997134526?channel=Copy-Link")

async function scrapeSmule(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    const title = $('meta[property="og:title"]').attr('content')?.replace(' | Smule', '');
    const description = $('meta[property="og:description"]').attr('content');
    const imageUrl = $('meta[property="og:image"]').attr('content');
    const videoUrl = $('meta[name="twitter:player:stream"]').attr('content');
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let artist = '';
    let performers = [];

    jsonLdScripts.each((i, elem) => {
      try {
        const jsonData = JSON.parse($(elem).html());
        if (Array.isArray(jsonData)) {
          jsonData.forEach(item => {
            if (item.producer && item.producer.name) {
              artist = item.producer.name;
            }
            if (item.recordingOf && item.recordingOf.sameAs) {
              performers = item.recordingOf.sameAs;
            }
          });
        }
      } catch (e) {
      }
    });

    const statsScript = $('script:contains("DataStore")').html();
    let stats = {};
    if (statsScript) {
      const statsMatch = statsScript.match(/"stats":\s*({[^}]+})/);
      if (statsMatch) {
        try {
          stats = JSON.parse(statsMatch[1]);
        } catch (e) {
        }
      }
    }

    const formattedStats = {
      listens: stats.total_listens || 0,
      loves: stats.total_loves || 0,
      comments: stats.total_comments || 0,
      gifts: stats.total_gifts || 0
    };

    return {
      title,
      description,
      imageUrl,
      videoUrl,
      artist,
      performers,
      stats: formattedStats,
      url
    };
  } catch (error) {
    return null;
  }
}

//scrapeSmule('https://www.smule.com/recording/noah-menghapus-jejakmu/1411828004_2997134526?channel=Copy-Link')

async function smuleDownload(url) {
  try {
    const form = new URLSearchParams();
    form.append("url", url);

    const { data: html } = await axios.post(
      "https://smuledownloader.online/",
      form.toString(),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "origin": "https://smuledownloader.online",
          "referer": "https://smuledownloader.online/",
          "user-agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        },
      }
    );

    const $ = cheerio.load(html);

    const thumbnail = $("#results .result-image img").attr("src");
    const title = $("#results .result-details h4").text().trim();

    const downloads = [];
    $("#results table tbody tr").each((i, el) => {
      const quality = $(el).find("td:nth-child(1)").text().trim();
      const format = $(el).find("td:nth-child(2)").text().trim();
      const downloadUrl = $(el).find("td:nth-child(3) a").attr("href");

      downloads.push({ quality, format, downloadUrl });
    });

    return {
      title,
      thumbnail,
      downloads,
    };
  } catch (err) {
    return { error: err.message };
  }
}

class Downloader {
  constructor() {
    this.apiJson = "https://snapthreads.net/api/download";
  }
  async download(url) {
    try {
      const {
        data
      } = await axios.get(`${this.apiJson}?url=${encodeURIComponent(url)}`, {
        headers: {
          accept: "*/*",
          "accept-language": "id-ID,id;q=0.9",
          "cache-control": "no-cache",
          pragma: "no-cache",
          priority: "u=1, i",
          referer: "https://snapthreads.net/id",
          "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Microsoft Edge Simulate";v="131", "Lemur";v="131"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        }
      });
      return data || {
        error: "Failed to fetch from SnapThreads"
      };
    } catch {
      return {
        error: "Failed to fetch from SnapThreads"
      };
    }
  }
}

async function x2twitter(url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!/(x.com|twitter.com)\/.*?\/status/gi.test(url)) 
        throw new Error(`Url is unvalid! please make sure to use correct x (Twitter) link, or make sure the post isn't deleted`);

      const base_url = "https://x2twitter.com",
            base_headers = {
              accept: "*/*",
              "accept-language": "en-EN,en;q=0.9,en-US;q=0.8,en;q=0.7,ms;q=0.6",
              "cache-control": "no-cache",
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
              pragma: "no-cache",
              priority: "u=1, i",
              "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "x-requested-with": "XMLHttpRequest",
              Referer: "https://x2twitter.com/en",
              "Referrer-Policy": "strict-origin-when-cross-origin"
            };

      const t = await axios.post(base_url + "/api/userverify", { url }, {
        headers: { ...base_headers, origin: base_url }
      }).then(v => v.data)
        .then(v => v.token || "")
        .catch(e => { throw new Error(`Failed to get JWT ${e}`); });

      let r = await axios.post(`${base_url}/api/ajaxSearch`, new URLSearchParams({
        q: url,
        lang: "id",
        cftoken: t || ""
      }).toString(), {
        headers: { ...base_headers, origin: base_url }
      }).then(v => v.data)
        .catch(e => { throw new Error(`Failed to get x data ${e}`); });

      if (r.status !== "ok") throw new Error(`Failed to get x data because of error ${r}`);

      r = r.data?.replace('"', '"');
      const $ = cheerio.load(r);

      let type = $("div").eq(0).attr("class");
      type = type.includes("tw-video") ? "video" : type.includes("video-data") && $(".photo-list").length ? "image" : "hybrid";

      if (type === "video") {
        const downloads = await Promise.all($(".dl-action").find("p").map(async (i, el) => {
          let name = $(el).text().trim().split(" ");
          name = name.slice(name.length - 2).join(" ");
          const tpe = name.includes("MP4") ? "mp4" : name.includes("MP3") ? "mp3" : "image";
          const reso = tpe === "mp4" ? name.split(" ").pop().replace(/\(\)/, "") : null;

          const url_link = tpe === "mp3"
            ? await (async () => {
                try {
                  const convert_url = /k_url_convert ?= ?"(.*?)";/.exec(r)[1];
                  const a = await axios.post(convert_url, new URLSearchParams({
                    ftype: tpe,
                    v_id: $(el).attr("data-mediaid"),
                    audioUrl: $(el).find("a").attr("data-audiourl"),
                    audioType: "video/mp4",
                    fquality: "128",
                    fname: "X2Twitter.com",
                    exp: /k_exp ?= ?"(.*?)";/.exec(r)[1],
                    token: /k_token ?= ?"(.*?)";/.exec(r)[1]
                  }).toString(), { headers: base_headers }).then(v => v.data);
                  return a.statusCode === 200 ? a.result : null;
                } catch {
                  return null;
                }
              })()
            : $(el).find("a").attr("href");

          return {
            name: name,
            type: tpe,
            reso: reso,
            url: url_link
          };
        }).get());

        return resolve({
          title: $(".content").find("h3").text().trim(),
          duration: $(".content").find("p").text().trim(),
          thumbnail: $(".thumbnail").find("img").attr("src"),
          type: "video",
          download: downloads
        });
      } else if (type === "image") {
        const downloads = $("ul.download-box").find("li").map((i, el) => ({
          type: "image",
          thumbnail: $(el).find("img").attr("src") || null,
          url: $(el).find("a").attr("href")
        })).get();

        return resolve({ download: downloads });
      }

    } catch (e) {
      return reject(`Error in twitter function : ${e}`);
    }
  });
}

async function ttstalk(username) {
return new Promise(async resolve => {
	let retryCount = 0;
	while (retryCount < 3) {
		try {
			const response = await axios.get(`https://tiktok.com/@${username}`);
			const $ = cheerio.load(response.data);

			
			const jsonData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').text();
			const parsedData = JSON.parse(jsonData);
			const userData = parsedData.__DEFAULT_SCOPE__['webapp.user-detail'].userInfo;

			const userInfo = {
				data: {
					...userData.user,
					...userData.stats
				}
			};
			
			resolve(userInfo);
		} catch (err) {
			console.error(`Attempt ${retryCount + 1} failed: ${err.message}`);
			retryCount++;
		}
	}
	throw new Error('Failed to fetch user data after 3 attempts.');
})
}


const API_KEY = 'AIzaSyDsafoap18n14RGdEMRLIAD6xjxzRrkJEA';

async function ytuser(username) {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${API_KEY}`;

    try {
        const searchResponse = await axios.get(searchUrl);
        const channel = searchResponse.data.items[0];

        if (channel) {
            const channelId = channel.id.channelId;
            const channelDetailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&id=${channelId}&key=${API_KEY}`;
            
            const channelResponse = await axios.get(channelDetailsUrl);
            const channelInfo = channelResponse.data.items[0];

            if (channelInfo) {
                const { title, description, thumbnails, publishedAt, country } = channelInfo.snippet;
                const { subscriberCount, viewCount, videoCount } = channelInfo.statistics;
                const uploadsPlaylistId = channelInfo.contentDetails.relatedPlaylists.uploads;

                // Ambil gambar avatar dalam resolusi tertinggi yang tersedia
                const avatarHD = thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default.url;

                // Ambil gambar banner dalam resolusi HD
                const bannerImageHD = channelInfo.brandingSettings?.image?.bannerExternalUrl || 'No banner available';

                // Ambil tanggal upload video terakhir
                const playlistItemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${API_KEY}`;
                const playlistResponse = await axios.get(playlistItemsUrl);
                const lastVideo = playlistResponse.data.items[0];

                let lastUploadDate = 'No uploads found';
                if (lastVideo) {
                    lastUploadDate = lastVideo.snippet.publishedAt;
                }

                // Mengambil informasi media sosial
                const socialLinks = channelInfo.brandingSettings?.channel?.externalLinks || [];
                const socialMedia = socialLinks.map(link => ({
                    title: link.title,
                    url: link.link
                }));

                const isVerified = subscriberCount > 100000;

                const channelUrl = `https://www.youtube.com/channel/${channelId}`;

                return {
                    ChannelId: channelId,
                    ChannelName: title,
                    deskripsi: description,
                    avatar: avatarHD, // Ambil avatar dalam resolusi HD
                    bannerImage: bannerImageHD, // Ambil banner dalam resolusi HD
                    subscribe: subscriberCount,
                    totalViews: viewCount,
                    totalVideos: videoCount,
                    joinDate: publishedAt,
                    lastUpload: lastUploadDate,
                    Verified: isVerified,
                    location: country || "Location not available",
                    url: channelUrl
                };
            } else {
                return { error: "Channel details not found." };
            }
        } else {
            return { error: "Channel not found." };
        }
    } catch (error) {
        return { error: "Error fetching channel data: " + error.message };
    }
}

const REGION_CODE = 'ID';

async function trendingyt() {
  const url = 'https://www.googleapis.com/youtube/v3/videos';

  try {
    const response = await axios.get(url, {
      params: {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        regionCode: REGION_CODE,
        maxResults: 50,
        key: API_KEY,
      },
    });

    const videos = response.data.items.map((video) => ({
      title: video.snippet.title,
      channel: video.snippet.channelTitle,
      views: video.statistics.viewCount,
      link: `https://www.youtube.com/watch?v=${video.id}`,
      uploadedAt: new Date(video.snippet.publishedAt).toLocaleDateString(),
    }));

    return videos;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

//ytuser("Nazedev");

async function igStalk(username) {
  try {
    const { data, status } = await axios.get(`https://igram.world/api/ig/userInfoByUsername/${username}`, {
      headers: {
        "User-Agent": "PostmanRuntime/7.37.0"
      }
    })
    if (data.result.user.pronouns.length === 0) {
      var pronoun = ""
    } else {
      const splPron = data.result.user.pronouns
      const addSlash = splPron.join("/")
      var pronoun = addSlash
    }
    const res = data.result.user
    const result = {
      status: true,
      username: res.username,
      fullName: res.full_name,
      followers: res.follower_count,
      following: res.following_count,
      pronouns: pronoun,
      verified: res.is_verified,
      private: res.is_private,
      totalPosts: res.media_count,
      bio: res.biography,
      externalUrl: res.external_url,
      urlAcc: `https://instagram.com/${username}`,
      profilePic: res.hd_profile_pic_url_info.url,
      pkId: res.pk_id
    }
    return result
  } catch (err) {
    result = {
      status: false,
      message: "Tidak dapat menemukan akun"
    }
    console.log(result)
    return result
  }
}

async function getInstagramProfile(username) {
  try {
    const response = await axios.post(
      "https://free-tools-api.vercel.app/api/instagram-profile-v2",
      { username: username },
      {
        headers: {
          "accept": "*/*",
          "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/json",
          "origin": "https://www.boostfluence.com",
          "referer": "https://www.boostfluence.com/",
          "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          "user-agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        },
      }
    );

    const data = response.data;

    return {
      username: data.username,
      name: data.full_name,
      bio: data.biography,
      followers: data.follower_count,
      followings: data.following_count,
      media: data.media_count,
      verified: data.is_verified,
      privte: data.is_private,
      external: data.external_url,
      category: data.category,
      download: data.profile_pic_url_hd,
    };
  } catch (err) {
    return { error: err.message }; // tangani error
  }
}

async function githubstalk(user) {
    return new Promise((resolve, reject) => {
        axios.get('https://api.github.com/users/'+user)
        .then(({ data }) => {
            let hasil = {
                username: data.login,
                nickname: data.name,
                bio: data.bio,
                id: data.id,
                nodeId: data.node_id,
                profile_pic: data.avatar_url,
                url: data.html_url,
                type: data.type,
                admin: data.site_admin,
                company: data.company,
                blog: data.blog,
                location: data.location,
                email: data.email,
                public_repo: data.public_repos,
                public_gists: data.public_gists,
                followers: data.followers,
                following: data.following,
                ceated_at: data.created_at,
                updated_at: data.updated_at
            }
            resolve(hasil)
        })
    })
}

const ipinfoToken = '882ffefc502ce1'; // Ganti dengan token API ipinfo.io

async function getIPInfo(ip) {
    const response = await axios.get(`http://ipinfo.io/${ip}/json?token=${ipinfoToken}`);
    return response.data;
  }
//getIPInfo("114.142.169.38")

async function fetchNopel(nopel) {
  const url = `https://listrik.okcek.com/dd.php?nopel=${nopel}`;
  
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

// Memanggil function dengan Nopel yang diberikan
//fetchNopel('172720204487');

async function scrapeKwai(url) {
  try {
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Error fetching the URL: ${response.status}`);
    }

    const html = response.data;
    const $ = cheerio.load(html);

    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content')?.trim() || '';

    const likeMatch = description.match(/(\d+)\s+Like\(s\)/);
    const commentMatch = description.match(/(\d+)\s+Comment\(s\)/);
    const usernameMatch = description.match(/Kwai video from (.+?)(?:\(|:)/);
    const captionMatch = description.match(/"(.+?)"/);

    const likeCount = likeMatch ? likeMatch[1] : '0';
    const commentCount = commentMatch ? commentMatch[1] : '0';
    const username = usernameMatch ? usernameMatch[1].trim() : '';
    const caption = captionMatch ? captionMatch[1] : '';


    const videoUrlScript = $('script#VideoObject').html();
    const videoUrlMatch = videoUrlScript && videoUrlScript.match(/"contentUrl":"([^"]+)"/);
    const extractedVideoUrl = videoUrlMatch ? videoUrlMatch[1].replace(/\\/g, '') : '';

    const imageUrl = $('meta[property="og:image"]').attr('content') || '';

    return {
      title,
      description,
      videoUrl: extractedVideoUrl,
      imageUrl,
      likeCount,
      commentCount,
      username,
      caption
    };

  } catch (error) {
    console.error('Error scraping Kwai:', error);
    return null;
  }
}

// Penggunaan
/*const url = 'https://www.kwai.com/@kwai/video/5240651221621089902';
scrapeKwai(url)*/

let COOKIE = "appSession=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwidWF0IjoxNzU4MTk3NzM5LCJpYXQiOjE3NTgxOTYxOTcsImV4cCI6MTc1ODI4NDEzOX0..y9w15tCmqRGtsieH.o-tMv5g0hjiV-gnemAwxqWHhReQD9ybJJbmBlWWCHTpii8WE2SI0oxHddnoPfc8V65BwUA7wdX4JIWJrzfyGWxWi5kZcPkSi-QUC3jIggTE8doJRM1kiNYPx2UTkl4xHF2pUgJsQ2ykSlfUzwmhVNOTK-1t9gXM00Ivi5OUaDxX7ihB1DGj33rC1sE8S-nS4-WXiNROJ7SGNbRsfJzX8zrG777ggfBV0F34Rd0SdS-_U1vhbIhNi36tlpSMG1zPoPGk3G-a4bZObl2dEWmlm3R_grJpy79xbehHVhI6VX3Wr2sN8otq4r-74Tabej_i-8z0kQ22JA3If95h71SQXSikEq3wkjmkkejeRImv4JRz0T3U2M4imiN_3PEcwc4ScchAPokTUzuTJnHdP1kKtO_qzX1UxqdPS87p3edVt22khhTf_DLWPSoXS2JgNIjNAyf-1xwA3WuGs2vg__q8GD8m-RUEo3F-Q0eos3H4FpvSYTTsD4l3Ay8K7Dqow9xRUQScMKguxtgJqX4L_Mq3suh2lOHaaM4sti3BaedJ9aXvXpBuiRimDHH3W7R_VmupgVBTgwokyAiNE24bJrAM47onkdamsE0D2mHce6EmYlmlZKmmu7RjYpb9EMKzD.tQilM5T1ShLBPcXPNYVSJw"; // isi awal waktu login/create

// bikin chatId konsisten (sekali buat, terus dipakai stream)
const CHAT_ID = "137f5f6a-4420-40fb-9c94-72a62ada9939";

// 1. Kirim pesan ke Shapes
async function sendMessage(text, model) {
  const msgId = uuidv4();
  const body = {
    id: CHAT_ID,
    message: {
      role: "user",
      content: text,
      id: msgId,
      createdAt: new Date().toISOString(),
      parts: [{ type: "text", text }],
    },
    selectedChatModel: "shapesinc/openaigpt5",
    selectedVisibilityType: "private",
    initialInterlocutors: ["shapesinc/openaigpt5"],
  };

  const res = await fetch("https://talk.shapes.inc/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: COOKIE,
    },
    body: JSON.stringify(body),
  });

  console.log("SendMessage status:", res.status, res.statusText);
  console.log("Headers:", Object.fromEntries(res.headers.entries()));

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    COOKIE = setCookie.split(";")[0]; // update appSession
    console.log("⚠️ Cookie updated:", COOKIE);
  }

  const raw = await res.text();
  if (!raw) {
    console.warn("⚠️ Response kosong dari server (normal untuk POST)");
  } else {
    console.log("SendMessage response raw:", raw);
  }
}

// 2. Listen balasan via SSE (stream)



// --- Listen balasan via Node.js stream ---
async function listenStream(chatId) {
  const url = `https://talk.shapes.inc/api/chat/${chatId}/stream`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', Cookie: COOKIE },
  });

  if (!res.ok) throw new Error("Stream gagal");

  return new Promise((resolve, reject) => {
    let buffer = '';
    res.body.on('data', chunk => {
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // sisakan sisa
      for (let line of lines) {
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return resolve(null);
          try {
            const data = JSON.parse(payload);
            if (data.type === 'new_message') {
              return resolve(`${data.sender.name}: ${data.message.parts[0].text}`);
            }
          } catch (e) {
            // skip jika JSON invalid
          }
        }
      }
    });

    res.body.on('end', () => resolve(null));
    res.body.on('error', err => reject(err));
  });
}

const CHAT_ID2 = "8b23254b-1d0e-4675-8c68-08d6b0fe06da";

// 1. Kirim pesan ke Shapes
async function sendMessages(text, model) {
  const msgId = uuidv4();
  const body = {
    id: CHAT_ID2,
    message: {
      role: "user",
      content: text,
      id: msgId,
      createdAt: new Date().toISOString(),
      parts: [{ type: "text", text }],
    },
    selectedChatModel: "shapesinc/chat-gpt-4o",
    selectedVisibilityType: "private",
    initialInterlocutors: ["shapesinc/chat-gpt-4o"],
  };

  const res = await fetch("https://talk.shapes.inc/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: COOKIE,
    },
    body: JSON.stringify(body),
  });

  console.log("SendMessage status:", res.status, res.statusText);
  console.log("Headers:", Object.fromEntries(res.headers.entries()));

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    COOKIE = setCookie.split(";")[0]; // update appSession
    console.log("⚠️ Cookie updated:", COOKIE);
  }

  const raw = await res.text();
  if (!raw) {
    console.warn("⚠️ Response kosong dari server (normal untuk POST)");
  } else {
    console.log("SendMessage response raw:", raw);
  }
}

// 2. Listen balasan via SSE (stream)

// --- Listen balasan via Node.js stream ---
async function listenStreamer(chatId) {
  const url = `https://talk.shapes.inc/api/chat/${chatId}/stream`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', Cookie: COOKIE },
  });

  if (!res.ok) throw new Error("Stream gagal");

  return new Promise((resolve, reject) => {
    let buffer = '';
    res.body.on('data', chunk => {
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // sisakan sisa
      for (let line of lines) {
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return resolve(null);
          try {
            const data = JSON.parse(payload);
            if (data.type === 'new_message') {
              return resolve(`${data.sender.name}: ${data.message.parts[0].text}`);
            }
          } catch (e) {
            // skip jika JSON invalid
          }
        }
      }
    });

    res.body.on('end', () => resolve(null));
    res.body.on('error', err => reject(err));
  });
}

class ChatGPTClient {
  constructor(options = {}) {
    this.baseURL = "https://chatgpt.com";
    this.deviceId = options.deviceId || crypto.randomUUID();
    this.language = options.language || "en-US";
    this.timezone = options.timezone || "Europe/Berlin";
    this.timezoneOffset = options.timezoneOffset || -120;
    this.tokenCSRF = null;
    this.tokenOaiSC = null;
    this.conduitToken = null;
    this.cookies = {};
    this.isInit = false;
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
    this.platform = '"Windows"';
    this.uaMobile = "?0";
    this.uaFull = '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    this.setupInterceptors();
  }
  setupInterceptors() {
    this.axiosInstance.interceptors.request.use(config => {
      if (Object.keys(this.cookies).length > 0) {
        config.headers.cookie = this.getCookieStr();
      }
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    }, error => {
      console.error("Request interceptor error:", error);
      return Promise.reject(error);
    });
    this.axiosInstance.interceptors.response.use(response => {
      this.updateCookies(response.headers["set-cookie"]);
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
      return response;
    }, error => {
      console.error(`❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || "Network Error"}`);
      return Promise.reject(error);
    });
  }
  updateCookies(cookieArr) {
    if (cookieArr) {
      cookieArr.forEach(cookie => {
        const parts = cookie.split(";");
        const keyVal = parts[0].split("=");
        if (keyVal.length === 2) {
          this.cookies[keyVal[0].trim()] = keyVal[1].trim();
        }
      });
    }
  }
  getCookieStr() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async randIp() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  randUuid() {
    return crypto.randomUUID().toString();
  }
  randFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(4);
  }
  encodeBase64(e) {
    try {
      return btoa(String.fromCharCode(...new TextEncoder().encode(e)));
    } catch {
      return btoa(unescape(encodeURIComponent(e)));
    }
  }
  async buildHeaders({
    accept,
    spoof = true,
    preUuid
  }) {
    const ip = await this.randIp();
    const uuid = preUuid || this.randUuid();
    const headers = {
      accept: accept,
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "cache-control": "no-cache",
      referer: `${this.baseURL}/`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "oai-device-id": uuid,
      "user-agent": this.userAgent,
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": this.uaFull,
      "sec-ch-ua-mobile": this.uaMobile,
      "sec-ch-ua-platform": this.platform,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      origin: this.baseURL
    };
    if (spoof) {
      headers["x-forwarded-for"] = ip;
      headers["x-originating-ip"] = ip;
      headers["x-remote-ip"] = ip;
      headers["x-remote-addr"] = ip;
      headers["x-host"] = ip;
      headers["x-forwarded-host"] = ip;
    }
    return headers;
  }
  async ensureInit() {
    if (!this.isInit) {
      console.log("🔄 Performing automatic initialization...");
      await this.init();
    }
  }
  async ensureSession() {
    if (!this.tokenCSRF || !this.deviceId) {
      console.warn("⚠️ Session data expired or missing, refreshing session...");
      await this.rotateSession();
    }
  }
  async init() {
    try {
      this.deviceId = crypto.randomUUID();
      await this.fetchCookies();
      await this.rotateSession();
      this.isInit = true;
      console.log("✅ Bot successfully initialized.");
    } catch (err) {
      console.error("❌ Failed during initialization:", err);
      this.isInit = false;
      throw err;
    }
  }
  async fetchCookies() {
    try {
      const headers = {
        "user-agent": this.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": this.uaFull,
        "sec-ch-ua-mobile": this.uaMobile,
        "sec-ch-ua-platform": this.platform,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      };
      const response = await this.axiosInstance.get("/", {
        headers: headers
      });
      console.log("🍪 Initial cookies successfully fetched.");
    } catch (err) {
      console.error("❌ Failed to fetch initial cookies:", err);
      throw err;
    }
  }
  async solveCaptcha(seed, difficulty) {
    const cores = [8, 12, 16, 24];
    const screens = [3e3, 4e3, 6e3];
    const core = cores[crypto.randomInt(0, cores.length)];
    const screen = screens[crypto.randomInt(0, screens.length)];
    const now = new Date(Date.now() - 8 * 3600 * 1e3);
    const timeStr = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");
    const config = [core + screen, timeStr, 4294705152, 0, this.userAgent];
    const diffLen = difficulty.length / 2;
    for (let i = 0; i < 1e5; i++) {
      config[3] = i;
      const jsonData = JSON.stringify(config);
      const base64 = Buffer.from(jsonData).toString("base64");
      const hash = crypto.createHash("sha3-512").update(seed + base64).digest();
      if (hash.toString("hex").substring(0, diffLen) <= difficulty) {
        return "gAAAAAB" + base64;
      }
    }
    const fallback = Buffer.from(`${seed}`).toString("base64");
    return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback;
  }
  async makeFakeToken() {
    const prefix = "gAAAAAC";
    const config = [crypto.randomInt(3e3, 6e3), new Date().toUTCString().replace("GMT", "GMT+0100 (Central European Time)"), 4294705152, 0, this.userAgent, "de", "de", 401, "mediaSession", "location", "scrollX", this.randFloat(1e3, 5e3), crypto.randomUUID(), "", 12, Date.now()];
    const base64 = Buffer.from(JSON.stringify(config)).toString("base64");
    return prefix + base64;
  }
  async rotateSession() {
    try {
      const uuid = this.randUuid();
      const csrf = await this.getCSRF(uuid);
      const sentinel = await this.getSentinel(uuid, csrf);
      this.tokenCSRF = csrf;
      this.tokenOaiSC = sentinel?.oaiSc;
      this.deviceId = uuid;
      return {
        uuid: uuid,
        csrf: csrf,
        sentinel: sentinel
      };
    } catch (err) {
      console.error("❌ Failed to refresh session:", err);
      throw err;
    }
  }
  async getCSRF(uuid) {
    if (this.tokenCSRF) {
      console.log("🔄 Using stored CSRF token.");
      return this.tokenCSRF;
    }
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    try {
      const response = await this.axiosInstance.get("/api/auth/csrf", {
        headers: headers
      });
      const data = response.data;
      if (!data?.csrfToken) {
        console.error("❌ Failed to get CSRF token:", data);
        throw new Error("Failed to get CSRF token.");
      }
      this.tokenCSRF = data.csrfToken;
      console.log("✅ CSRF token successfully obtained.");
      return this.tokenCSRF;
    } catch (err) {
      console.error("❌ Error getting CSRF token:", err);
      throw new Error("Failed to get CSRF token.");
    }
  }
  async getSentinel(uuid, csrf) {
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    const fakeToken = await this.makeFakeToken();
    const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`;
    try {
      const response = await this.axiosInstance.post("/backend-anon/sentinel/chat-requirements", {
        p: fakeToken
      }, {
        headers: {
          ...headers,
          cookie: cookieStr
        }
      });
      const data = response.data;
      if (!data?.token || !data?.proofofwork) {
        console.error("❌ Failed to get sentinel token:", data);
        throw new Error("Failed to get sentinel token.");
      }
      let oaiSc = null;
      const cookieHeader = response.headers["set-cookie"];
      if (cookieHeader) {
        const oaiScCookie = cookieHeader.find(c => c.startsWith("oai-sc="));
        if (oaiScCookie) {
          oaiSc = oaiScCookie.split("oai-sc=")[1]?.split(";")[0] || null;
        } else {
          console.warn("⚠️ oai-sc token not found in cookie header.");
        }
      }
      const challenge = await this.solveCaptcha(data.proofofwork.seed, data.proofofwork.difficulty);
      console.log("✅ Sentinel token successfully obtained.");
      if (oaiSc) console.log("✅ oai-sc token successfully obtained.");
      return {
        token: data.token,
        proof: challenge,
        oaiSc: oaiSc
      };
    } catch (err) {
      console.error("❌ Error getting sentinel token:", err);
      throw new Error("Failed to get sentinel token.");
    }
  }
  parseResponse(input) {
  const parsed =
    input.split("\n")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        try {
          const json = JSON.parse(part.slice(6));
          if (json.message && json.message.status === "finished_successfully") {
            json.message.metadata.model = "gpt-5"; // paksa tulis model
            return json;
          }
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

  return parsed?.message.content.parts.join("")
  .replace(/GPT-4/gi, "gpt-5") || input;
}
  async chat(options = {}) {
    const {
      prompt = "Hello, how are you?",
        messages = [],
        model = "gpt-5",
        timezone_offset_min = -120,
        history_and_training_disabled = false,
        conversation_mode = {
          kind: "primary_assistant",
          plugin_ids: null
        },
        force_paragen = false,
        force_paragen_model_slug = "",
        force_nulligen = false,
        force_rate_limit = false,
        reset_rate_limits = false,
        force_use_sse = true, ...rest
    } = options;
    if (!prompt && messages.length === 0) {
      throw new Error("Prompt or messages are required");
    }
    try {
      await this.ensureInit();
      await this.ensureSession();
      const currentMessages = messages.length ? messages : [{
        id: this.randUuid(),
        author: {
          role: "user"
        },
        content: {
          content_type: "text",
          parts: [prompt]
        },
        metadata: {}
      }];
      const parentId = messages.length ? messages[messages.length - 1].id : this.randUuid();
      const headers = await this.buildHeaders({
        accept: "text/plain",
        spoof: true,
        preUuid: this.deviceId
      });
      const sentinel = await this.getSentinel(this.deviceId, this.tokenCSRF);
      const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${this.tokenCSRF}; oai-did=${this.deviceId}; oai-nav-state=1; ${sentinel?.oaiSc ? `oai-sc=${sentinel.oaiSc};` : ""}`;
      const requestData = {
        action: "next",
        messages: currentMessages,
        parent_message_id: parentId,
        model: model,
        timezone_offset_min: timezone_offset_min,
        suggestions: [],
        history_and_training_disabled: history_and_training_disabled,
        conversation_mode: conversation_mode,
        force_paragen: force_paragen,
        force_paragen_model_slug: force_paragen_model_slug,
        force_nulligen: force_nulligen,
        force_rate_limit: force_rate_limit,
        reset_rate_limits: reset_rate_limits,
        websocket_request_id: this.randUuid(),
        force_use_sse: force_use_sse,
        ...rest
      };
      const response = await this.axiosInstance.post("/backend-anon/conversation", requestData, {
        headers: {
          ...headers,
          cookie: cookieStr,
          "openai-sentinel-chat-requirements-token": sentinel?.token,
          "openai-sentinel-proof-token": sentinel?.proof
        }
      });
      if (response.status !== 200) {
        console.error("❌ HTTP Error:", response.status, response.statusText);
        throw new Error(`HTTP Error! status: ${response.status}`);
      }
      const text = response.data;
      const parsed = this.parseResponse(text);
      console.log("✅ Response received.");
      return {
        result: parsed,
        rawResponse: text,
        success: true
      };
    } catch (error) {
      console.error("❌ Chat error:", error);
      throw error;
    }
  }
  setHeaders(headers) {
    Object.assign(this.axiosInstance.defaults.headers, headers);
  }
  getSessionInfo() {
    return {
      deviceId: this.deviceId,
      tokenCSRF: this.tokenCSRF,
      tokenOaiSC: this.tokenOaiSC,
      cookies: this.cookies,
      isInit: this.isInit
    };
  }
  async refreshSession() {
    console.log("🔄 Manually refreshing session...");
    await this.rotateSession();
  }
}

class ChatGPTClients {
  constructor(options = {}) {
    this.baseURL = "https://chatgpt.com";
    this.deviceId = options.deviceId || crypto.randomUUID();
    this.language = options.language || "en-US";
    this.timezone = options.timezone || "Europe/Berlin";
    this.timezoneOffset = options.timezoneOffset || -120;
    this.tokenCSRF = null;
    this.tokenOaiSC = null;
    this.conduitToken = null;
    this.cookies = {};
    this.isInit = false;
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
    this.platform = '"Windows"';
    this.uaMobile = "?0";
    this.uaFull = '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    this.setupInterceptors();
  }
  setupInterceptors() {
    this.axiosInstance.interceptors.request.use(config => {
      if (Object.keys(this.cookies).length > 0) {
        config.headers.cookie = this.getCookieStr();
      }
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    }, error => {
      console.error("Request interceptor error:", error);
      return Promise.reject(error);
    });
    this.axiosInstance.interceptors.response.use(response => {
      this.updateCookies(response.headers["set-cookie"]);
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
      return response;
    }, error => {
      console.error(`❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || "Network Error"}`);
      return Promise.reject(error);
    });
  }
  updateCookies(cookieArr) {
    if (cookieArr) {
      cookieArr.forEach(cookie => {
        const parts = cookie.split(";");
        const keyVal = parts[0].split("=");
        if (keyVal.length === 2) {
          this.cookies[keyVal[0].trim()] = keyVal[1].trim();
        }
      });
    }
  }
  getCookieStr() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async randIp() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  randUuid() {
    return crypto.randomUUID().toString();
  }
  randFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(4);
  }
  encodeBase64(e) {
    try {
      return btoa(String.fromCharCode(...new TextEncoder().encode(e)));
    } catch {
      return btoa(unescape(encodeURIComponent(e)));
    }
  }
  async buildHeaders({
    accept,
    spoof = true,
    preUuid
  }) {
    const ip = await this.randIp();
    const uuid = preUuid || this.randUuid();
    const headers = {
      accept: accept,
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "cache-control": "no-cache",
      referer: `${this.baseURL}/`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "oai-device-id": uuid,
      "user-agent": this.userAgent,
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": this.uaFull,
      "sec-ch-ua-mobile": this.uaMobile,
      "sec-ch-ua-platform": this.platform,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      origin: this.baseURL
    };
    if (spoof) {
      headers["x-forwarded-for"] = ip;
      headers["x-originating-ip"] = ip;
      headers["x-remote-ip"] = ip;
      headers["x-remote-addr"] = ip;
      headers["x-host"] = ip;
      headers["x-forwarded-host"] = ip;
    }
    return headers;
  }
  async ensureInit() {
    if (!this.isInit) {
      console.log("🔄 Performing automatic initialization...");
      await this.init();
    }
  }
  async ensureSession() {
    if (!this.tokenCSRF || !this.deviceId) {
      console.warn("⚠️ Session data expired or missing, refreshing session...");
      await this.rotateSession();
    }
  }
  async init() {
    try {
      this.deviceId = crypto.randomUUID();
      await this.fetchCookies();
      await this.rotateSession();
      this.isInit = true;
      console.log("✅ Bot successfully initialized.");
    } catch (err) {
      console.error("❌ Failed during initialization:", err);
      this.isInit = false;
      throw err;
    }
  }
  async fetchCookies() {
    try {
      const headers = {
        "user-agent": this.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": this.uaFull,
        "sec-ch-ua-mobile": this.uaMobile,
        "sec-ch-ua-platform": this.platform,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      };
      const response = await this.axiosInstance.get("/", {
        headers: headers
      });
      console.log("🍪 Initial cookies successfully fetched.");
    } catch (err) {
      console.error("❌ Failed to fetch initial cookies:", err);
      throw err;
    }
  }
  async solveCaptcha(seed, difficulty) {
    const cores = [8, 12, 16, 24];
    const screens = [3e3, 4e3, 6e3];
    const core = cores[crypto.randomInt(0, cores.length)];
    const screen = screens[crypto.randomInt(0, screens.length)];
    const now = new Date(Date.now() - 8 * 3600 * 1e3);
    const timeStr = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");
    const config = [core + screen, timeStr, 4294705152, 0, this.userAgent];
    const diffLen = difficulty.length / 2;
    for (let i = 0; i < 1e5; i++) {
      config[3] = i;
      const jsonData = JSON.stringify(config);
      const base64 = Buffer.from(jsonData).toString("base64");
      const hash = crypto.createHash("sha3-512").update(seed + base64).digest();
      if (hash.toString("hex").substring(0, diffLen) <= difficulty) {
        return "gAAAAAB" + base64;
      }
    }
    const fallback = Buffer.from(`${seed}`).toString("base64");
    return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback;
  }
  async makeFakeToken() {
    const prefix = "gAAAAAC";
    const config = [crypto.randomInt(3e3, 6e3), new Date().toUTCString().replace("GMT", "GMT+0100 (Central European Time)"), 4294705152, 0, this.userAgent, "de", "de", 401, "mediaSession", "location", "scrollX", this.randFloat(1e3, 5e3), crypto.randomUUID(), "", 12, Date.now()];
    const base64 = Buffer.from(JSON.stringify(config)).toString("base64");
    return prefix + base64;
  }
  async rotateSession() {
    try {
      const uuid = this.randUuid();
      const csrf = await this.getCSRF(uuid);
      const sentinel = await this.getSentinel(uuid, csrf);
      this.tokenCSRF = csrf;
      this.tokenOaiSC = sentinel?.oaiSc;
      this.deviceId = uuid;
      return {
        uuid: uuid,
        csrf: csrf,
        sentinel: sentinel
      };
    } catch (err) {
      console.error("❌ Failed to refresh session:", err);
      throw err;
    }
  }
  async getCSRF(uuid) {
    if (this.tokenCSRF) {
      console.log("🔄 Using stored CSRF token.");
      return this.tokenCSRF;
    }
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    try {
      const response = await this.axiosInstance.get("/api/auth/csrf", {
        headers: headers
      });
      const data = response.data;
      if (!data?.csrfToken) {
        console.error("❌ Failed to get CSRF token:", data);
        throw new Error("Failed to get CSRF token.");
      }
      this.tokenCSRF = data.csrfToken;
      console.log("✅ CSRF token successfully obtained.");
      return this.tokenCSRF;
    } catch (err) {
      console.error("❌ Error getting CSRF token:", err);
      throw new Error("Failed to get CSRF token.");
    }
  }
  async getSentinel(uuid, csrf) {
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    const fakeToken = await this.makeFakeToken();
    const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`;
    try {
      const response = await this.axiosInstance.post("/backend-anon/sentinel/chat-requirements", {
        p: fakeToken
      }, {
        headers: {
          ...headers,
          cookie: cookieStr
        }
      });
      const data = response.data;
      if (!data?.token || !data?.proofofwork) {
        console.error("❌ Failed to get sentinel token:", data);
        throw new Error("Failed to get sentinel token.");
      }
      let oaiSc = null;
      const cookieHeader = response.headers["set-cookie"];
      if (cookieHeader) {
        const oaiScCookie = cookieHeader.find(c => c.startsWith("oai-sc="));
        if (oaiScCookie) {
          oaiSc = oaiScCookie.split("oai-sc=")[1]?.split(";")[0] || null;
        } else {
          console.warn("⚠️ oai-sc token not found in cookie header.");
        }
      }
      const challenge = await this.solveCaptcha(data.proofofwork.seed, data.proofofwork.difficulty);
      console.log("✅ Sentinel token successfully obtained.");
      if (oaiSc) console.log("✅ oai-sc token successfully obtained.");
      return {
        token: data.token,
        proof: challenge,
        oaiSc: oaiSc
      };
    } catch (err) {
      console.error("❌ Error getting sentinel token:", err);
      throw new Error("Failed to get sentinel token.");
    }
  }
  parseResponse(input) {
  const parsed =
    input.split("\n")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        try {
          const json = JSON.parse(part.slice(6));
          if (json.message && json.message.status === "finished_successfully") {
            json.message.metadata.model = "gpt-5-mini"; // paksa tulis model
            return json;
          }
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

  return parsed?.message.content.parts.join("")
  .replace(/GPT-4/gi, "gpt-5-mini") || input;
}
  async chat(options = {}) {
    const {
      prompt = "Hello, how are you?",
        messages = [],
        model = "gpt-5-mini",
        timezone_offset_min = -120,
        history_and_training_disabled = false,
        conversation_mode = {
          kind: "primary_assistant",
          plugin_ids: null
        },
        force_paragen = false,
        force_paragen_model_slug = "",
        force_nulligen = false,
        force_rate_limit = false,
        reset_rate_limits = false,
        force_use_sse = true, ...rest
    } = options;
    if (!prompt && messages.length === 0) {
      throw new Error("Prompt or messages are required");
    }
    try {
      await this.ensureInit();
      await this.ensureSession();
      const currentMessages = messages.length ? messages : [{
        id: this.randUuid(),
        author: {
          role: "user"
        },
        content: {
          content_type: "text",
          parts: [prompt]
        },
        metadata: {}
      }];
      const parentId = messages.length ? messages[messages.length - 1].id : this.randUuid();
      const headers = await this.buildHeaders({
        accept: "text/plain",
        spoof: true,
        preUuid: this.deviceId
      });
      const sentinel = await this.getSentinel(this.deviceId, this.tokenCSRF);
      const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${this.tokenCSRF}; oai-did=${this.deviceId}; oai-nav-state=1; ${sentinel?.oaiSc ? `oai-sc=${sentinel.oaiSc};` : ""}`;
      const requestData = {
        action: "next",
        messages: currentMessages,
        parent_message_id: parentId,
        model: model,
        timezone_offset_min: timezone_offset_min,
        suggestions: [],
        history_and_training_disabled: history_and_training_disabled,
        conversation_mode: conversation_mode,
        force_paragen: force_paragen,
        force_paragen_model_slug: force_paragen_model_slug,
        force_nulligen: force_nulligen,
        force_rate_limit: force_rate_limit,
        reset_rate_limits: reset_rate_limits,
        websocket_request_id: this.randUuid(),
        force_use_sse: force_use_sse,
        ...rest
      };
      const response = await this.axiosInstance.post("/backend-anon/conversation", requestData, {
        headers: {
          ...headers,
          cookie: cookieStr,
          "openai-sentinel-chat-requirements-token": sentinel?.token,
          "openai-sentinel-proof-token": sentinel?.proof
        }
      });
      if (response.status !== 200) {
        console.error("❌ HTTP Error:", response.status, response.statusText);
        throw new Error(`HTTP Error! status: ${response.status}`);
      }
      const text = response.data;
      const parsed = this.parseResponse(text);
      console.log("✅ Response received.");
      return {
        result: parsed,
        rawResponse: text,
        success: true
      };
    } catch (error) {
      console.error("❌ Chat error:", error);
      throw error;
    }
  }
  setHeaders(headers) {
    Object.assign(this.axiosInstance.defaults.headers, headers);
  }
  getSessionInfo() {
    return {
      deviceId: this.deviceId,
      tokenCSRF: this.tokenCSRF,
      tokenOaiSC: this.tokenOaiSC,
      cookies: this.cookies,
      isInit: this.isInit
    };
  }
  async refreshSession() {
    console.log("🔄 Manually refreshing session...");
    await this.rotateSession();
  }
}

class ChatGPTClientsi {
  constructor(options = {}) {
    this.baseURL = "https://chatgpt.com";
    this.deviceId = options.deviceId || crypto.randomUUID();
    this.language = options.language || "en-US";
    this.timezone = options.timezone || "Europe/Berlin";
    this.timezoneOffset = options.timezoneOffset || -120;
    this.tokenCSRF = null;
    this.tokenOaiSC = null;
    this.conduitToken = null;
    this.cookies = {};
    this.isInit = false;
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
    this.platform = '"Windows"';
    this.uaMobile = "?0";
    this.uaFull = '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    this.setupInterceptors();
  }
  setupInterceptors() {
    this.axiosInstance.interceptors.request.use(config => {
      if (Object.keys(this.cookies).length > 0) {
        config.headers.cookie = this.getCookieStr();
      }
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    }, error => {
      console.error("Request interceptor error:", error);
      return Promise.reject(error);
    });
    this.axiosInstance.interceptors.response.use(response => {
      this.updateCookies(response.headers["set-cookie"]);
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
      return response;
    }, error => {
      console.error(`❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || "Network Error"}`);
      return Promise.reject(error);
    });
  }
  updateCookies(cookieArr) {
    if (cookieArr) {
      cookieArr.forEach(cookie => {
        const parts = cookie.split(";");
        const keyVal = parts[0].split("=");
        if (keyVal.length === 2) {
          this.cookies[keyVal[0].trim()] = keyVal[1].trim();
        }
      });
    }
  }
  getCookieStr() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async randIp() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  randUuid() {
    return crypto.randomUUID().toString();
  }
  randFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(4);
  }
  encodeBase64(e) {
    try {
      return btoa(String.fromCharCode(...new TextEncoder().encode(e)));
    } catch {
      return btoa(unescape(encodeURIComponent(e)));
    }
  }
  async buildHeaders({
    accept,
    spoof = true,
    preUuid
  }) {
    const ip = await this.randIp();
    const uuid = preUuid || this.randUuid();
    const headers = {
      accept: accept,
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "cache-control": "no-cache",
      referer: `${this.baseURL}/`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "oai-device-id": uuid,
      "user-agent": this.userAgent,
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": this.uaFull,
      "sec-ch-ua-mobile": this.uaMobile,
      "sec-ch-ua-platform": this.platform,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      origin: this.baseURL
    };
    if (spoof) {
      headers["x-forwarded-for"] = ip;
      headers["x-originating-ip"] = ip;
      headers["x-remote-ip"] = ip;
      headers["x-remote-addr"] = ip;
      headers["x-host"] = ip;
      headers["x-forwarded-host"] = ip;
    }
    return headers;
  }
  async ensureInit() {
    if (!this.isInit) {
      console.log("🔄 Performing automatic initialization...");
      await this.init();
    }
  }
  async ensureSession() {
    if (!this.tokenCSRF || !this.deviceId) {
      console.warn("⚠️ Session data expired or missing, refreshing session...");
      await this.rotateSession();
    }
  }
  async init() {
    try {
      this.deviceId = crypto.randomUUID();
      await this.fetchCookies();
      await this.rotateSession();
      this.isInit = true;
      console.log("✅ Bot successfully initialized.");
    } catch (err) {
      console.error("❌ Failed during initialization:", err);
      this.isInit = false;
      throw err;
    }
  }
  async fetchCookies() {
    try {
      const headers = {
        "user-agent": this.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": this.uaFull,
        "sec-ch-ua-mobile": this.uaMobile,
        "sec-ch-ua-platform": this.platform,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      };
      const response = await this.axiosInstance.get("/", {
        headers: headers
      });
      console.log("🍪 Initial cookies successfully fetched.");
    } catch (err) {
      console.error("❌ Failed to fetch initial cookies:", err);
      throw err;
    }
  }
  async solveCaptcha(seed, difficulty) {
    const cores = [8, 12, 16, 24];
    const screens = [3e3, 4e3, 6e3];
    const core = cores[crypto.randomInt(0, cores.length)];
    const screen = screens[crypto.randomInt(0, screens.length)];
    const now = new Date(Date.now() - 8 * 3600 * 1e3);
    const timeStr = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");
    const config = [core + screen, timeStr, 4294705152, 0, this.userAgent];
    const diffLen = difficulty.length / 2;
    for (let i = 0; i < 1e5; i++) {
      config[3] = i;
      const jsonData = JSON.stringify(config);
      const base64 = Buffer.from(jsonData).toString("base64");
      const hash = crypto.createHash("sha3-512").update(seed + base64).digest();
      if (hash.toString("hex").substring(0, diffLen) <= difficulty) {
        return "gAAAAAB" + base64;
      }
    }
    const fallback = Buffer.from(`${seed}`).toString("base64");
    return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback;
  }
  async makeFakeToken() {
    const prefix = "gAAAAAC";
    const config = [crypto.randomInt(3e3, 6e3), new Date().toUTCString().replace("GMT", "GMT+0100 (Central European Time)"), 4294705152, 0, this.userAgent, "de", "de", 401, "mediaSession", "location", "scrollX", this.randFloat(1e3, 5e3), crypto.randomUUID(), "", 12, Date.now()];
    const base64 = Buffer.from(JSON.stringify(config)).toString("base64");
    return prefix + base64;
  }
  async rotateSession() {
    try {
      const uuid = this.randUuid();
      const csrf = await this.getCSRF(uuid);
      const sentinel = await this.getSentinel(uuid, csrf);
      this.tokenCSRF = csrf;
      this.tokenOaiSC = sentinel?.oaiSc;
      this.deviceId = uuid;
      return {
        uuid: uuid,
        csrf: csrf,
        sentinel: sentinel
      };
    } catch (err) {
      console.error("❌ Failed to refresh session:", err);
      throw err;
    }
  }
  async getCSRF(uuid) {
    if (this.tokenCSRF) {
      console.log("🔄 Using stored CSRF token.");
      return this.tokenCSRF;
    }
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    try {
      const response = await this.axiosInstance.get("/api/auth/csrf", {
        headers: headers
      });
      const data = response.data;
      if (!data?.csrfToken) {
        console.error("❌ Failed to get CSRF token:", data);
        throw new Error("Failed to get CSRF token.");
      }
      this.tokenCSRF = data.csrfToken;
      console.log("✅ CSRF token successfully obtained.");
      return this.tokenCSRF;
    } catch (err) {
      console.error("❌ Error getting CSRF token:", err);
      throw new Error("Failed to get CSRF token.");
    }
  }
  async getSentinel(uuid, csrf) {
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    const fakeToken = await this.makeFakeToken();
    const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`;
    try {
      const response = await this.axiosInstance.post("/backend-anon/sentinel/chat-requirements", {
        p: fakeToken
      }, {
        headers: {
          ...headers,
          cookie: cookieStr
        }
      });
      const data = response.data;
      if (!data?.token || !data?.proofofwork) {
        console.error("❌ Failed to get sentinel token:", data);
        throw new Error("Failed to get sentinel token.");
      }
      let oaiSc = null;
      const cookieHeader = response.headers["set-cookie"];
      if (cookieHeader) {
        const oaiScCookie = cookieHeader.find(c => c.startsWith("oai-sc="));
        if (oaiScCookie) {
          oaiSc = oaiScCookie.split("oai-sc=")[1]?.split(";")[0] || null;
        } else {
          console.warn("⚠️ oai-sc token not found in cookie header.");
        }
      }
      const challenge = await this.solveCaptcha(data.proofofwork.seed, data.proofofwork.difficulty);
      console.log("✅ Sentinel token successfully obtained.");
      if (oaiSc) console.log("✅ oai-sc token successfully obtained.");
      return {
        token: data.token,
        proof: challenge,
        oaiSc: oaiSc
      };
    } catch (err) {
      console.error("❌ Error getting sentinel token:", err);
      throw new Error("Failed to get sentinel token.");
    }
  }
  parseResponse(input) {
  const parsed =
    input.split("\n")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        try {
          const json = JSON.parse(part.slice(6));
          if (json.message && json.message.status === "finished_successfully") {
            json.message.metadata.model = "gpt-4o-2024-08-06"; // paksa tulis model
            return json;
          }
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

  return parsed?.message.content.parts.join("")
  .replace(/GPT-4/gi, "gpt-4o-2024-08-06") || input;
}
  async chat(options = {}) {
    const {
      prompt = "Hello, how are you?",
        messages = [],
        model = "gpt-4o-2024-08-06",
        timezone_offset_min = -120,
        history_and_training_disabled = false,
        conversation_mode = {
          kind: "primary_assistant",
          plugin_ids: null
        },
        force_paragen = false,
        force_paragen_model_slug = "",
        force_nulligen = false,
        force_rate_limit = false,
        reset_rate_limits = false,
        force_use_sse = true, ...rest
    } = options;
    if (!prompt && messages.length === 0) {
      throw new Error("Prompt or messages are required");
    }
    try {
      await this.ensureInit();
      await this.ensureSession();
      const currentMessages = messages.length ? messages : [{
        id: this.randUuid(),
        author: {
          role: "user"
        },
        content: {
          content_type: "text",
          parts: [prompt]
        },
        metadata: {}
      }];
      const parentId = messages.length ? messages[messages.length - 1].id : this.randUuid();
      const headers = await this.buildHeaders({
        accept: "text/plain",
        spoof: true,
        preUuid: this.deviceId
      });
      const sentinel = await this.getSentinel(this.deviceId, this.tokenCSRF);
      const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${this.tokenCSRF}; oai-did=${this.deviceId}; oai-nav-state=1; ${sentinel?.oaiSc ? `oai-sc=${sentinel.oaiSc};` : ""}`;
      const requestData = {
        action: "next",
        messages: currentMessages,
        parent_message_id: parentId,
        model: model,
        timezone_offset_min: timezone_offset_min,
        suggestions: [],
        history_and_training_disabled: history_and_training_disabled,
        conversation_mode: conversation_mode,
        force_paragen: force_paragen,
        force_paragen_model_slug: force_paragen_model_slug,
        force_nulligen: force_nulligen,
        force_rate_limit: force_rate_limit,
        reset_rate_limits: reset_rate_limits,
        websocket_request_id: this.randUuid(),
        force_use_sse: force_use_sse,
        ...rest
      };
      const response = await this.axiosInstance.post("/backend-anon/conversation", requestData, {
        headers: {
          ...headers,
          cookie: cookieStr,
          "openai-sentinel-chat-requirements-token": sentinel?.token,
          "openai-sentinel-proof-token": sentinel?.proof
        }
      });
      if (response.status !== 200) {
        console.error("❌ HTTP Error:", response.status, response.statusText);
        throw new Error(`HTTP Error! status: ${response.status}`);
      }
      const text = response.data;
      const parsed = this.parseResponse(text);
      console.log("✅ Response received.");
      return {
        result: parsed,
        rawResponse: text,
        success: true
      };
    } catch (error) {
      console.error("❌ Chat error:", error);
      throw error;
    }
  }
  setHeaders(headers) {
    Object.assign(this.axiosInstance.defaults.headers, headers);
  }
  getSessionInfo() {
    return {
      deviceId: this.deviceId,
      tokenCSRF: this.tokenCSRF,
      tokenOaiSC: this.tokenOaiSC,
      cookies: this.cookies,
      isInit: this.isInit
    };
  }
  async refreshSession() {
    console.log("🔄 Manually refreshing session...");
    await this.rotateSession();
  }
}


class ChatGPTClientsy {
  constructor(options = {}) {
    this.baseURL = "https://chatgpt.com";
    this.deviceId = options.deviceId || crypto.randomUUID();
    this.language = options.language || "en-US";
    this.timezone = options.timezone || "Europe/Berlin";
    this.timezoneOffset = options.timezoneOffset || -120;
    this.tokenCSRF = null;
    this.tokenOaiSC = null;
    this.conduitToken = null;
    this.cookies = {};
    this.isInit = false;
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
    this.platform = '"Windows"';
    this.uaMobile = "?0";
    this.uaFull = '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    this.setupInterceptors();
  }
  setupInterceptors() {
    this.axiosInstance.interceptors.request.use(config => {
      if (Object.keys(this.cookies).length > 0) {
        config.headers.cookie = this.getCookieStr();
      }
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    }, error => {
      console.error("Request interceptor error:", error);
      return Promise.reject(error);
    });
    this.axiosInstance.interceptors.response.use(response => {
      this.updateCookies(response.headers["set-cookie"]);
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
      return response;
    }, error => {
      console.error(`❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || "Network Error"}`);
      return Promise.reject(error);
    });
  }
  updateCookies(cookieArr) {
    if (cookieArr) {
      cookieArr.forEach(cookie => {
        const parts = cookie.split(";");
        const keyVal = parts[0].split("=");
        if (keyVal.length === 2) {
          this.cookies[keyVal[0].trim()] = keyVal[1].trim();
        }
      });
    }
  }
  getCookieStr() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async randIp() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  randUuid() {
    return crypto.randomUUID().toString();
  }
  randFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(4);
  }
  encodeBase64(e) {
    try {
      return btoa(String.fromCharCode(...new TextEncoder().encode(e)));
    } catch {
      return btoa(unescape(encodeURIComponent(e)));
    }
  }
  async buildHeaders({
    accept,
    spoof = true,
    preUuid
  }) {
    const ip = await this.randIp();
    const uuid = preUuid || this.randUuid();
    const headers = {
      accept: accept,
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "cache-control": "no-cache",
      referer: `${this.baseURL}/`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "oai-device-id": uuid,
      "user-agent": this.userAgent,
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": this.uaFull,
      "sec-ch-ua-mobile": this.uaMobile,
      "sec-ch-ua-platform": this.platform,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      origin: this.baseURL
    };
    if (spoof) {
      headers["x-forwarded-for"] = ip;
      headers["x-originating-ip"] = ip;
      headers["x-remote-ip"] = ip;
      headers["x-remote-addr"] = ip;
      headers["x-host"] = ip;
      headers["x-forwarded-host"] = ip;
    }
    return headers;
  }
  async ensureInit() {
    if (!this.isInit) {
      console.log("🔄 Performing automatic initialization...");
      await this.init();
    }
  }
  async ensureSession() {
    if (!this.tokenCSRF || !this.deviceId) {
      console.warn("⚠️ Session data expired or missing, refreshing session...");
      await this.rotateSession();
    }
  }
  async init() {
    try {
      this.deviceId = crypto.randomUUID();
      await this.fetchCookies();
      await this.rotateSession();
      this.isInit = true;
      console.log("✅ Bot successfully initialized.");
    } catch (err) {
      console.error("❌ Failed during initialization:", err);
      this.isInit = false;
      throw err;
    }
  }
  async fetchCookies() {
    try {
      const headers = {
        "user-agent": this.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": this.uaFull,
        "sec-ch-ua-mobile": this.uaMobile,
        "sec-ch-ua-platform": this.platform,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      };
      const response = await this.axiosInstance.get("/", {
        headers: headers
      });
      console.log("🍪 Initial cookies successfully fetched.");
    } catch (err) {
      console.error("❌ Failed to fetch initial cookies:", err);
      throw err;
    }
  }
  async solveCaptcha(seed, difficulty) {
    const cores = [8, 12, 16, 24];
    const screens = [3e3, 4e3, 6e3];
    const core = cores[crypto.randomInt(0, cores.length)];
    const screen = screens[crypto.randomInt(0, screens.length)];
    const now = new Date(Date.now() - 8 * 3600 * 1e3);
    const timeStr = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");
    const config = [core + screen, timeStr, 4294705152, 0, this.userAgent];
    const diffLen = difficulty.length / 2;
    for (let i = 0; i < 1e5; i++) {
      config[3] = i;
      const jsonData = JSON.stringify(config);
      const base64 = Buffer.from(jsonData).toString("base64");
      const hash = crypto.createHash("sha3-512").update(seed + base64).digest();
      if (hash.toString("hex").substring(0, diffLen) <= difficulty) {
        return "gAAAAAB" + base64;
      }
    }
    const fallback = Buffer.from(`${seed}`).toString("base64");
    return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback;
  }
  async makeFakeToken() {
    const prefix = "gAAAAAC";
    const config = [crypto.randomInt(3e3, 6e3), new Date().toUTCString().replace("GMT", "GMT+0100 (Central European Time)"), 4294705152, 0, this.userAgent, "de", "de", 401, "mediaSession", "location", "scrollX", this.randFloat(1e3, 5e3), crypto.randomUUID(), "", 12, Date.now()];
    const base64 = Buffer.from(JSON.stringify(config)).toString("base64");
    return prefix + base64;
  }
  async rotateSession() {
    try {
      const uuid = this.randUuid();
      const csrf = await this.getCSRF(uuid);
      const sentinel = await this.getSentinel(uuid, csrf);
      this.tokenCSRF = csrf;
      this.tokenOaiSC = sentinel?.oaiSc;
      this.deviceId = uuid;
      return {
        uuid: uuid,
        csrf: csrf,
        sentinel: sentinel
      };
    } catch (err) {
      console.error("❌ Failed to refresh session:", err);
      throw err;
    }
  }
  async getCSRF(uuid) {
    if (this.tokenCSRF) {
      console.log("🔄 Using stored CSRF token.");
      return this.tokenCSRF;
    }
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    try {
      const response = await this.axiosInstance.get("/api/auth/csrf", {
        headers: headers
      });
      const data = response.data;
      if (!data?.csrfToken) {
        console.error("❌ Failed to get CSRF token:", data);
        throw new Error("Failed to get CSRF token.");
      }
      this.tokenCSRF = data.csrfToken;
      console.log("✅ CSRF token successfully obtained.");
      return this.tokenCSRF;
    } catch (err) {
      console.error("❌ Error getting CSRF token:", err);
      throw new Error("Failed to get CSRF token.");
    }
  }
  async getSentinel(uuid, csrf) {
    const headers = await this.buildHeaders({
      accept: "application/json",
      spoof: true,
      preUuid: uuid
    });
    const fakeToken = await this.makeFakeToken();
    const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`;
    try {
      const response = await this.axiosInstance.post("/backend-anon/sentinel/chat-requirements", {
        p: fakeToken
      }, {
        headers: {
          ...headers,
          cookie: cookieStr
        }
      });
      const data = response.data;
      if (!data?.token || !data?.proofofwork) {
        console.error("❌ Failed to get sentinel token:", data);
        throw new Error("Failed to get sentinel token.");
      }
      let oaiSc = null;
      const cookieHeader = response.headers["set-cookie"];
      if (cookieHeader) {
        const oaiScCookie = cookieHeader.find(c => c.startsWith("oai-sc="));
        if (oaiScCookie) {
          oaiSc = oaiScCookie.split("oai-sc=")[1]?.split(";")[0] || null;
        } else {
          console.warn("⚠️ oai-sc token not found in cookie header.");
        }
      }
      const challenge = await this.solveCaptcha(data.proofofwork.seed, data.proofofwork.difficulty);
      console.log("✅ Sentinel token successfully obtained.");
      if (oaiSc) console.log("✅ oai-sc token successfully obtained.");
      return {
        token: data.token,
        proof: challenge,
        oaiSc: oaiSc
      };
    } catch (err) {
      console.error("❌ Error getting sentinel token:", err);
      throw new Error("Failed to get sentinel token.");
    }
  }
  parseResponse(input) {
  const parsed =
    input.split("\n")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        try {
          const json = JSON.parse(part.slice(6));
          if (json.message && json.message.status === "finished_successfully") {
            json.message.metadata.model = "gpt-5-nano"; // paksa tulis model
            return json;
          }
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

  return parsed?.message.content.parts.join("")
  .replace(/GPT-4/gi, "gpt-5-nano") || input;
}
  async chat(options = {}) {
    const {
      prompt = "Hello, how are you?",
        messages = [],
        model = "gpt-5-nano",
        timezone_offset_min = -120,
        history_and_training_disabled = false,
        conversation_mode = {
          kind: "primary_assistant",
          plugin_ids: null
        },
        force_paragen = false,
        force_paragen_model_slug = "",
        force_nulligen = false,
        force_rate_limit = false,
        reset_rate_limits = false,
        force_use_sse = true, ...rest
    } = options;
    if (!prompt && messages.length === 0) {
      throw new Error("Prompt or messages are required");
    }
    try {
      await this.ensureInit();
      await this.ensureSession();
      const currentMessages = messages.length ? messages : [{
        id: this.randUuid(),
        author: {
          role: "user"
        },
        content: {
          content_type: "text",
          parts: [prompt]
        },
        metadata: {}
      }];
      const parentId = messages.length ? messages[messages.length - 1].id : this.randUuid();
      const headers = await this.buildHeaders({
        accept: "text/plain",
        spoof: true,
        preUuid: this.deviceId
      });
      const sentinel = await this.getSentinel(this.deviceId, this.tokenCSRF);
      const cookieStr = `${this.getCookieStr()}; __Host-next-auth.csrf-token=${this.tokenCSRF}; oai-did=${this.deviceId}; oai-nav-state=1; ${sentinel?.oaiSc ? `oai-sc=${sentinel.oaiSc};` : ""}`;
      const requestData = {
        action: "next",
        messages: currentMessages,
        parent_message_id: parentId,
        model: model,
        timezone_offset_min: timezone_offset_min,
        suggestions: [],
        history_and_training_disabled: history_and_training_disabled,
        conversation_mode: conversation_mode,
        force_paragen: force_paragen,
        force_paragen_model_slug: force_paragen_model_slug,
        force_nulligen: force_nulligen,
        force_rate_limit: force_rate_limit,
        reset_rate_limits: reset_rate_limits,
        websocket_request_id: this.randUuid(),
        force_use_sse: force_use_sse,
        ...rest
      };
      const response = await this.axiosInstance.post("/backend-anon/conversation", requestData, {
        headers: {
          ...headers,
          cookie: cookieStr,
          "openai-sentinel-chat-requirements-token": sentinel?.token,
          "openai-sentinel-proof-token": sentinel?.proof
        }
      });
      if (response.status !== 200) {
        console.error("❌ HTTP Error:", response.status, response.statusText);
        throw new Error(`HTTP Error! status: ${response.status}`);
      }
      const text = response.data;
      const parsed = this.parseResponse(text);
      console.log("✅ Response received.");
      return {
        result: parsed,
        rawResponse: text,
        success: true
      };
    } catch (error) {
      console.error("❌ Chat error:", error);
      throw error;
    }
  }
  setHeaders(headers) {
    Object.assign(this.axiosInstance.defaults.headers, headers);
  }
  getSessionInfo() {
    return {
      deviceId: this.deviceId,
      tokenCSRF: this.tokenCSRF,
      tokenOaiSC: this.tokenOaiSC,
      cookies: this.cookies,
      isInit: this.isInit
    };
  }
  async refreshSession() {
    console.log("🔄 Manually refreshing session...");
    await this.rotateSession();
  }
}

class GlitXCore {
  constructor() {
    this.baseUrl = "https://glitx.com";
    this.password = "hafndauowfkjasasdfn";
    this.iterations = 100;
  }

  encrypt(msg, pwd) {
    const salt = CryptoJS.lib.WordArray.random(32);
    const key = CryptoJS.PBKDF2(pwd, salt, {
      keySize: 8,
      iterations: this.iterations,
      hasher: CryptoJS.algo.SHA1
    });
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(msg, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    const result = salt.concat(iv).concat(CryptoJS.enc.Base64.parse(encrypted.toString()));
    return CryptoJS.enc.Base64.stringify(result);
  }

  generateToken(url) {
    return this.encrypt(url.slice(0, 1500), this.password);
  }
}

async function capcutdl(urlCapCut) {
  try {
    const postData = qs.stringify({
      action: "fetch_capcut_content",
      nonce: "8d6bf8b02c",
      url: urlCapCut
    });

    const { data } = await axios.post(
      "https://sscapcut.com/wp-admin/admin-ajax.php",
      postData,
      {
        headers: {
          "authority": "sscapcut.com",
          "accept": "*/*",
          "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "cookie": "pll_language=id; _ga_S9YJ25WN4Y=GS2.1.s1758322629$o1$g0$t1758322629$j60$l0$h0; _ga=GA1.1.357439759.1758322630; __gads=ID=0d37e62d8aa893b2:T=1758322634:RT=1758322634:S=ALNI_MZ6V6budAnj9vfUUkvFef-lJagRcA; __gpi=UID=00001198bd181ca1:T=1758322634:RT=1758322634:S=ALNI_MaLvTQWQe2RhJKrNo1GNFNqWMFAsQ; __eoi=ID=fce3f973befa84c2:T=1758322634:RT=1758322634:S=AA-AfjY8bUuZsKC_h3fqdcZyqhRN",
          "origin": "https://sscapcut.com",
          "referer": "https://sscapcut.com/id/",
          "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
          "x-requested-with": "XMLHttpRequest"
        }
      }
    );

    if (!data.success) return { status: "error", message: "Fetch failed" };

    const $ = cheerio.load(data.data.html);

    // Ambil meta data dasar
    const title = $("title").text() || null;
    const description = $("meta[name='description']").attr("content") || null;
    const thumbnail = $("meta[property='og:image']").attr("content") || null;
    const videoUrl = $("meta[property='og:video:url']").attr("content") || null;

    return {
      title,
      description,
      thumbnail,
      videoUrl
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

async function fetchPinterestVideoUrl() {
  try {
    const url = 'https://pinterestvideo.com/';
    const headers = {
      'authority': 'pinterestvideo.com',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'max-age=0',
      'content-type': 'application/x-www-form-urlencoded',
      'cookie': '_ga=GA1.1.1514192957.1754007240; cf_clearance=DCyKrGBJJ7EZEgFkCv_iPofcqUTenvXx.Vt.GJWRc3M-1758327175-1.2.1.1-SjyEqafq49yMCpCc0rfAGIb_3jUdwm55YD0jx3ZVzzVAUru9eZa6PiE3muAcT8oV36V4YQxLcvoceO2odKjTmJFnltl8xq73kW.aCL69b8V7VqtIZaqwPFdYZdCPgVVuNsZDyPO2mzHJdrj_FVTeVDPLf4ahiBaBlLzQ0fKuN5ybWE9mKuUrPbPw3a3Plk1tWv9ILwV0iR3Rb6Xq8WN8tgD3_COMFaktxS3MqP6vKg8; __gads=ID=873d2ad374d99429:T=1754007241:RT=1758327185:S=ALNI_MYsK7g2rmFg7Q85Q_Kb-BkUzafSxg; __gpi=UID=00001173777dd3f4:T=1754007241:RT=1758327185:S=ALNI_MZdR-2DSafjGCNTN7qv1FsCa1LmyA; __eoi=ID=5ce0bc1bc9199e05:T=1754007241:RT=1758327185:S=AA-AfjbOXKE5QlIsSMo0ql2OitSg; _ga_829VPPN299=GS2.1.s1758327172$o2$g1$t1758327200$j32$l0$h0',
      'origin': 'https://pinterestvideo.com',
      'referer': 'https://pinterestvideo.com/',
      'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'upgrade-insecure-requests': '1',
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
    };

    const postData = qs.stringify({
      'process_id': 'iuOyxPCfBZ=dGkEOisP=c1YSKzwneN2CGwAplj0hYqNB3sTx2fNrYWfDFnAhk3LESk=nIVTaqvMX',
      'process_url': 'https://pin.it/6uLtsjqZw'
    });

    const response = await axios.post(url, postData, { headers });

    // Parse HTML
    const $ = cheerio.load(response.data);
    const videoSrc = $('video source').attr('src');
    const downloadLink = $('a.downloadBtn').first().attr('href');

    return {
      downloadLink
    };
  } catch (err) {
    return { error: err.message };
  }
}

class OCRService {
  constructor() {
    this.apiUrl = "https://demo.api4ai.cloud/ocr/v1/results";
  }

  async ocr(url) {
    try {
      const formData = new FormData();
      formData.append("url", url);

      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      const result = response.data.results?.[0];
      if (!result) return "";

      let text = "";
      if (result.entities?.[0]?.objects) {
        for (const obj of result.entities[0].objects) {
          if (obj.entities) {
            for (const ent of obj.entities) {
              if (ent.text) text += ent.text + " ";
            }
          }
        }
      }
      text = text.replace(/\s+/g, " ").trim();
      text = text
        .replace(/X{2,}/gi, "")
        .replace(/\d+\/\d+/g, "")
        .replace(/\b\d+\b/g, "")
        .replace(/\s{2,}/g, " ")

      return text.trim();
    } catch (error) {
      console.error("Error while processing OCR request:", error.message);
      throw error;
    }
  }
}

async function allinone(videoUrl) {
  try {
    const glitxCore = new GlitXCore();
    const token = glitxCore.generateToken(videoUrl);

    const { data } = await axios.post(
      "https://glitx.com/ajaxCore.php",
      `token=${encodeURIComponent(token)}&hash=hashpin535&lang=en`,
      {
        headers: {
          "accept": "*/*",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        }
      }
    );

    const $ = cheerio.load(data);

    function getTextAfterStrong(label) {
      const strong = $(`strong:contains("${label}")`);
      if (!strong.length) return null;
      const node = strong[0].nextSibling;
      return node ? node.nodeValue.trim() : null;
    }

    const title = getTextAfterStrong("Title:");
    const publisher = getTextAfterStrong("Publisher:");
    const duration = getTextAfterStrong("Duration:");
    const thumbnail = $("img.img-fluid").attr("src") || null;

    const makeFullUrl = (href) =>
      href && href.startsWith("/") ? `https://glitx.com${href}` : href || null;

    const video = makeFullUrl($("a:contains('Download Video')").attr("href"));
    const photo = makeFullUrl($("a:contains('Download Photo')").attr("href"));
    const firstFrame = makeFullUrl($("a:contains('Download First Frame')").attr("href"));
    const animatedThumb = makeFullUrl($("a:contains('Download Animated Thumbnail')").attr("href"));

    return {
      status: "ok",
      title,
      publisher,
      duration,
      thumbnail,
      video,
      photo,
      firstFrame,
      animatedThumb
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

class SpotdlDownloader {
  constructor(baseURL, headers) {
    this.cookieStore = {};
    this.api = axios.create({
      baseURL: baseURL || "https://spotdl.io",
      headers: headers || {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "id-ID",
        Priority: "u=1, i"
      }
    });
    this.setupInterceptors();
    this.csrfToken = null;
    console.log("AxiosClient initialized");
  }
  setupInterceptors() {
    this.api.interceptors.response.use(response => {
      const setCookieHeader = response.headers["set-cookie"];
      if (setCookieHeader) {
        setCookieHeader.forEach(cookieString => {
          const cookiePair = cookieString.split(";")[0];
          const [name, value] = cookiePair.split("=");
          if (name && value) {
            this.cookieStore[name.trim()] = value.trim();
          }
        });
        console.log("Proses: Cookies diperbarui:", this.cookieStore);
      }
      return response;
    }, error => {
      return Promise.reject(error);
    });
    this.api.interceptors.request.use(config => {
      const cookieKeys = Object.keys(this.cookieStore);
      if (cookieKeys.length > 0) {
        const cookieString = cookieKeys.map(key => `${key}=${this.cookieStore[key]}`).join("; ");
        config.headers["Cookie"] = cookieString;
        console.log(`Proses: Mengirim cookies: ${cookieString}`);
      }
      return config;
    }, error => {
      return Promise.reject(error);
    });
  }
  async getToken() {
    console.log("Proses: Mengambil CSRF token...");
    try {
      const response = await this.api.get("/");
      const html = response.data;
      const $ = cheerio.load(html);
      const token = $('meta[name="csrf-token"]').attr("content") || null;
      if (token) {
        this.csrfToken = token;
        this.api.defaults.headers.common["x-csrf-token"] = this.csrfToken;
        console.log(`Proses: CSRF token ditemukan: ${this.csrfToken}`);
      } else {
        console.error("Proses: Gagal menemukan CSRF token.");
      }
      return this.csrfToken;
    } catch (error) {
      console.error("Error saat mengambil token:", error.message);
      console.error("Detail Error:", error.response?.data);
      throw error;
    }
  }
  async getTrack(spotifyUrl) {
    console.log(`Proses: Mendapatkan data untuk URL: ${spotifyUrl}`);
    if (!this.csrfToken) {
      console.log("Proses: CSRF token tidak ditemukan, menjalankan getToken()...");
      await this.getToken();
    }
    try {
      const response = await this.api.post("/getTrackData", {
        spotify_url: spotifyUrl
      });
      console.log("Proses: Berhasil mendapatkan data track.");
      return response.data;
    } catch (error) {
      console.error("Error saat mendapatkan data track:", error.message);
      console.error("Detail Error:", error.response?.data);
      throw error;
    }
  }
  async convert(trackUrl) {
    console.log(`Proses: Mengonversi URL: ${trackUrl}`);
    try {
      const response = await this.api.post("/convert", {
        urls: trackUrl
      });
      const downloadUrl = response.data?.url ? response.data.url : "URL tidak ditemukan";
      console.log(`Proses: Berhasil mendapatkan link konversi.`);
      return response.data;
    } catch (error) {
      console.error("Error saat konversi:", error.message);
      console.error("Detail Error:", error.response?.data);
      throw error;
    }
  }
  async download({ url, ...rest }) {
  console.log("Proses: Memulai proses unduhan...");
  try {
    const meta = await this.getTrack(url);
    const convertResponse = await this.convert(url);
    const finalUrl = convertResponse?.url || null;

    if (!finalUrl) {
      console.log("Proses: Gagal mendapatkan URL unduhan akhir.");
      return null;
    }

    console.log(`Proses: URL unduhan akhir: ${finalUrl}`);

    // ambil 1 gambar pertama (bukan array)
    const image = meta?.album?.images?.[0]?.url || null;
    // ambil 1 artis pertama (bukan array)
    const artist = meta?.artists?.[0]?.name || null;

    return {
      judul: meta?.name || null,
      type: meta?.type || null,
      image: image,
      artis: artist,
      download: finalUrl
    };
  } catch (error) {
    console.error("Proses unduhan gagal:", error.message);
    return null;
  }
}
}

class Gemini {
  constructor() {
    this.instance = axios.create({
      baseURL: "https://gemini.google.com/_/BardChatUi",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
      }
    });
    this.instance.interceptors.request.use(config => {
      console.log(`[Request] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    }, error => {
      console.error("[Request Error]", error);
      return Promise.reject(error);
    });
    this.instance.interceptors.response.use(response => {
      console.log("[Response]", response.status);
      return response;
    }, error => {
      console.error("[Response Error]", error.message);
      return Promise.reject(error);
    });
  }
  async getNewCookie() {
    try {
      const params = new URLSearchParams({
        rpcids: "maGuAc",
        "source-path": "/",
        bl: "boq_assistant-bard-web-server_20250814.06_p1",
        "f.sid": "-7816331052118000090",
        hl: "en-US",
        _reqid: Math.floor(1e5 + Math.random() * 9e5),
        rt: "c"
      });
      const response = await this.instance.post(`/data/batchexecute?${params}`, "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&");
      return response?.headers?.["set-cookie"]?.[0]?.split("; ")?.[0];
    } catch (error) {
      console.error("Cookie Error:", error.message);
      throw error;
    }
  }
  async chat(prompt, previousId = null) {
    try {
      if (!prompt?.trim()) throw new Error("Prompt is required");
      const {
        newResumeArray: resumeArray,
        cookie
      } = previousId ? JSON.parse(atob(previousId)) : {};
      const headers = {
        "x-goog-ext-525001261-jspb": '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
        cookie: cookie || await this.getNewCookie()
      };
      const body = new URLSearchParams({
        "f.req": JSON.stringify([null, JSON.stringify([
          [prompt],
          ["en-US"], resumeArray
        ])])
      });
      const params = new URLSearchParams({
        rpcids: "maGuAc",
        bl: "boq_assistant-bard-web-server_20250729.06_p0",
        "f.sid": "4206607810970164620",
        hl: "en-US",
        _reqid: Math.floor(1e6 + Math.random() * 9e6),
        rt: "c"
      });
      const response = await this.instance.post(`/data/assistant.lamda.BardFrontendService/StreamGenerate?${params}`, body, {
        headers: headers
      });
      const parsedData = this.parseResponse(response.data);
      const text = parsedData?.[4]?.[0]?.[1]?.[0]?.replace(/\*\*(.+?)\*\*/g, "*$1*");
      const newResumeArray = [...parsedData?.[1] || [], parsedData?.[4]?.[0]?.[0]];
      return {
        result: text,
      };
    } catch (error) {
      console.error("Ask Error:", error.message);
      throw error;
    }
  }
  parseResponse(data) {
    try {
      const match = [...data.matchAll(/^\d+\n(.+?)\n/gm)]?.reverse()?.[3]?.[1];
      return match ? JSON.parse(JSON.parse(match)?.[0]?.[2]) : null;
    } catch (error) {
      console.error("Parse Error:", error.message);
      return null;
    }
  }
}

// --- jalankan ---
/*(async () => {
  await sendMessage("Hallo, kamu sedang apa sekarang sayang???");
  const lastMessage = await listenStream(CHAT_ID);
  console.log("💬 Last message:", lastMessage);
})();*/

let getTokenC = async (isT) => {
    try {
        const response = await axios.get(
            `${isT ? isT.url : `https://age.toolpie.com`}`,
        );
        //
        const $ = cheerio.load(response.data);
        let v = $(`input[name="${isT ? isT.target : `_token`}"]`).val();
        const tokenValue = isT
            ? Array.isArray(isT.target)
                ? isT.target.flatMap((t) => {
                      return { [t.t]: $(`${t.t}`).attr(`${t.action}`) };
                  })
                : v
            : v;
        const cookies = response.headers["set-cookie"];
        return { cookies, token: tokenValue };
    } catch {
        return null;
    }
};

const downloadImage = async (imageUrl) => {
    const response = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
    });

    return response.data;
};

const APIKEY = 'cFreKVe8_poChMfuA-OgYIQZbCKVkQU2';
const API_SECRET = 'SZcC0l11XuTAWK3hUs7lS0XLcpr7hhge';

async function roboguru(pertanyaan) {
  try {
    const response = await axios.get(
      `https://roboguru.ruangguru.com/api/v3/roboguru-discovery/search/question?gradeSerial=3GAWQ3PJRB&subjectName=Bahasa%20Indonesia&withVideo=true&text=${encodeURIComponent(pertanyaan)}&imageURL=&singleQuestion=false`,
      {
        headers: {
          "content-type": "application/json",
          "country": "id",
          "disable-node-proxy": "false",
          "platform": "web",
          "with-auth": "true",
          "cookie": "_roboguruSession=0665281f-7288-4275-89ce-4e6d23034e53; __rg_cookie_id__=dccbaa2e-894b-46e4-bd0b-cabab28d11d6; __tracker_session_id__=091df164-a539-4cc9-bcad-a0effde9f4a9; role=student; _rgSession=6f5ad37f-3b21-4670-8fcd-9b0021af4339; isLoggedIn=true; name=Danzz; profpic=https%3A%2F%2Fimgix3.ruangguru.com%2Fassets%2Finitials-rounded%2FD_model_2.jpg%3Fw%3D360; userID=DANZZ8SOMEQ36ZKL; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJydCI6ImV5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUpqYVdRaU9pSTNNamxSUjI5T05ERkJJaXdpWlhod0lqb3hOek16TWprM05EVXlMQ0oxYVdRaU9qSTJOak00TkRZMU9Dd2lkVzlqSWpvaVJFRk9XbG80VTA5TlJWRXpObHBMVENJc0luSWlPaUp6ZEhWa1pXNTBJaXdpWkdsa0lqb2laR05qWW1GaE1tVXRPRGswWWkwME5tVTBMV0prTUdJdFkyRmlZV0l5T0dReE1XUTJJaXdpWkc0aU9pSk9iMjVsSWl3aWRHOXJaVzVKUkNJNklqRTNNekEzTURVME16YzNOelkxTXpNeU5EUWlmUS5PMFgxTlM3Q0xyMVQ1cnlTRkJwYVpBelE1NUJidkZUenVleEN5cEdmWk8wIiwiZXhwIjoxNzMwNzkxODUyLCJ1aWQiOjI2NjM4NDY1OCwidW9jIjoiREFOWlo4U09NRVEzNlpLTCIsInIiOiJzdHVkZW50IiwiZGlkIjoiZGNjYmFhMmUtODk0Yi00NmU0LWJkMGItY2FiYWIyOGQxMWQ2IiwiZG4iOiJOb25lIiwidG9rZW5JRCI6IjE3MzA3MDU0Mzc3NzY1MzMyNDQifQ.HFM2LOncjG818-balWCpAHkUHfvTBMZCsGcWyLiD5Gk; refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaWQiOiI3MjlRR29ONDFBIiwiZXhwIjoxNzMzMjk3NDUyLCJ1aWQiOjI2NjM4NDY1OCwidW9jIjoiREFOWlo4U09NRVEzNlpLTCIsInIiOiJzdHVkZW50IiwiZGlkIjoiZGNjYmFhMmUtODk0Yi00NmU0LWJkMGItY2FiYWIyOGQxMWQ2IiwiZG4iOiJOb25lIiwidG9rZW5JRCI6IjE3MzA3MDU0Mzc3NzY1MzMyNDQifQ.O0X1NS7CLr1T5rySFBpaZAzQ55BbvFTzuexCypGfZO0; expireToken=1730791672000; __cf_bm=RHlEolpMXHETYz7wz9u960487BqVFVSD41.UdH_PkWc-1730705478-1.0.1.1-Lo7Bje.lj3KAmUAZp9dl4n2D81q2EDXG96q7edkQiPKp6okSLMSdrx.veDfQ5BQ1jF737Au6jC.z_ghzVbGsaA"
        }
      }
    );

    const result = response.data.data.questions;
    const danzz = result[Math.floor(Math.random() * result.length)];

    const sanitizeHTML = (text) => {
      return text
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/&nbsp;/g, " ");
    };

    const sanitizedResult = sanitizeHTML(danzz.contentDefinition);
    return sanitizedResult;
  } catch (error) {
    throw new Error('Error fetching data from Roboguru: ' + error.message);
  }
}
//roboguru("apa itu fotosintesi")

async function scraperSnackVideo(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;
    const regex = /<source src="(.*?)" type="video\/mp4"/g;
    const videoUrl = regex.exec(html)[1];
    return videoUrl;
  } catch (error) {
    console.log(error);
  }
}

function parseDuration(s) {
	return [s / 3600, s / 60 % 60, s % 60].map(v => Math.floor(v).toString().padStart(2, '0')).join(':');
}

async function youtubeDl(url) {
	return new Promise(async (resolve, reject) => {
		try {
			const headers = {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Origin': 'https://www.yt1s.com',
				'Referer': 'https://www.yt1s.com/',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0'
			}
			const anu = async (vid, k) => axios.post('https://www.yt1s.com/api/ajaxConvert/convert', new URLSearchParams({ vid, k }), { headers }).then(a => a.data.dlink)
			const { data } = await axios.post('https://www.yt1s.com/api/ajaxSearch/index', new URLSearchParams({ q: url, vt: 'home' }), { headers });
			const resultUrl = {
				video: await Promise.all(Object.values(data.links.mp4).map(async v => ({
					size: v.size,
					format: v.f,
					quality: v.q,
					download: await anu(data.vid, v.k)
				}))),
				audio: await Promise.all(Object.values(data.links.mp3).map(async v => ({
					size: v.size,
					format: v.f,
					quality: v.q,
					download: await anu(data.vid, v.k)
				})))
			}
			resolve({
				id: data.vid,
				title: data.title,
				duration: parseDuration(data.t),
				author: data.a,
				resultUrl
			})
		} catch (e) {
			reject(e)
		}
	})
}

//youtubeDl('https://youtu.be/RefUix32PeE')

var durationMultipliers = {
   1: { 0: 1 },
   2: { 0: 60, 1: 1 },
   3: { 0: 3600, 1: 60, 2: 1 }
};

function youtubeSearch(query) {
   return new Promise((resolve, reject) => {
      axios("https://m.youtube.com/results?search_query="+query, { method: "GET", headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36' } }).then(({ data }) => {
         const $ = cheerio.load(data)
         var sc;
         $('script').map(function () {
         const el = $(this).html();
         let regex;
            if ((regex = /var ytInitialData = /gi.exec(el || ''))) {
             sc = JSON.parse(regex.input.replace(/^var ytInitialData = /i, '').replace(/;$/, ''));
            }
            return regex && sc;
         });
         var results = { video: [], channel: [], playlist: [] };
           sc.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents.forEach((v) => {
              var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13;
              const typeName = Object.keys(v)[0];
              const result = v[typeName];
              if (['horizontalCardListRenderer', 'shelfRenderer'].includes(typeName)) {
                  return;
              }
              const isChannel = typeName === 'channelRenderer';
              const isVideo = typeName === 'videoRenderer';
              const isMix = typeName === 'radioRenderer';
              //===[ Filtering ]===\\
              if (isVideo) {
                 const view = ((_a = result.viewCountText) === null || _a === void 0 ? void 0 : _a.simpleText) || ((_b = result.shortViewCountText) === null || _b === void 0 ? void 0 : _b.simpleText) || ((_d = (_c = result.shortViewCountText) === null || _c === void 0 ? void 0 : _c.accessibility) === null || _d === void 0 ? void 0 : _d.accessibilityData.label);
                 const _duration = (_f = (_e = result.thumbnailOverlays) === null || _e === void 0 ? void 0 : _e.find((v) => Object.keys(v)[0] === 'thumbnailOverlayTimeStatusRenderer')) === null || _f === void 0 ? void 0 : _f.thumbnailOverlayTimeStatusRenderer.text;
                 const videoId = result.videoId;
                 const duration = ((_g = result.lengthText) === null || _g === void 0 ? void 0 : _g.simpleText) || (_duration === null || _duration === void 0 ? void 0 : _duration.simpleText);
                 let durationS = 0;
                   (_h = ((duration === null || duration === void 0 ? void 0 : duration.split('.').length) && duration.indexOf(':') === -1 ? duration.split('.') : duration === null || duration === void 0 ? void 0 : duration.split(':'))) === null || _h === void 0 ? void 0 : _h.forEach((v, i, arr) => (durationS += durationMultipliers[arr.length]['' + i] * parseInt(v)));
                 results.video.push({
                    authorName: (_l = (((_j = result.ownerText) === null || _j === void 0 ? void 0 : _j.runs) || ((_k = result.longBylineText) === null || _k === void 0 ? void 0 : _k.runs) || [])[0]) === null || _l === void 0 ? void 0 : _l.text,
                    authorAvatar: (_p = (_o = (_m = result.channelThumbnailSupportedRenderers) === null || _m === void 0 ? void 0 : _m.channelThumbnailWithLinkRenderer.thumbnail.thumbnails) === null || _o === void 0 ? void 0 : _o.filter(({ url }) => url)) === null || _p === void 0 ? void 0 : _p.pop().url,
                    videoId,
                    url: encodeURI('https://www.youtube.com/watch?v=' + videoId),
                    thumbnail: result.thumbnail.thumbnails.pop().url,
                    title: (_t = (((_r = (_q = result.title) === null || _q === void 0 ? void 0 : _q.runs.find((v) => v.text)) === null || _r === void 0 ? void 0 : _r.text) || ((_s = result.title) === null || _s === void 0 ? void 0 : _s.accessibility.accessibilityData.label))) === null || _t === void 0 ? void 0 : _t.trim(),
                    description: (_y = (_x = (_w = (_v = (_u = result.detailedMetadataSnippets) === null || _u === void 0 ? void 0 : _u[0]) === null || _v === void 0 ? void 0 : _v.snippetText.runs) === null || _w === void 0 ? void 0 : _w.filter(({ text }) => text)) === null || _x === void 0 ? void 0 : _x.map(({ text }) => text)) === null || _y === void 0 ? void 0 : _y.join(''),
                    publishedTime: (_z = result.publishedTimeText) === null || _z === void 0 ? void 0 : _z.simpleText,
                    durationH: ((_0 = result.lengthText) === null || _0 === void 0 ? void 0 : _0.accessibility.accessibilityData.label) || (_duration === null || _duration === void 0 ? void 0 : _duration.accessibility.accessibilityData.label),
                    durationS,
                    duration,
                    viewH: view,
                    view: (_1 = (((view === null || view === void 0 ? void 0 : view.indexOf('x')) === -1 ? view === null || view === void 0 ? void 0 : view.split(' ')[0] : view === null || view === void 0 ? void 0 : view.split('x')[0]) || view)) === null || _1 === void 0 ? void 0 : _1.trim(),
                    type: typeName.replace(/Renderer/i, '')
                 });
              }
              if (isChannel) {
                 const channelId = result.channelId;
                 //const _subscriber = ((_2 = result.subscriberCountText) === null || _2 === void 0 ? void 0 : _2.accessibility.accessibilityData.label) || ((_3 = result.subscriberCountText) === null || _3 === void 0 ? void 0 : _3.simpleText);
                 results.channel.push({
                    channelId,
                    url: encodeURI('https://www.youtube.com/channel/' + channelId),
                    channelName: result.title.simpleText || ((_5 = (_4 = result.shortBylineText) === null || _4 === void 0 ? void 0 : _4.runs.find((v) => v.text)) === null || _5 === void 0 ? void 0 : _5.text),
                    avatar: 'https:' + ((_6 = result.thumbnail.thumbnails.filter(({ url }) => url)) === null || _6 === void 0 ? void 0 : _6.pop().url),
                    isVerified: ((_7 = result.ownerBadges) === null || _7 === void 0 ? void 0 : _7.pop().metadataBadgeRenderer.style) === 'BADGE_STYLE_TYPE_VERIFIED',
                    subscriberH: result.videoCountText ? result.videoCountText.simpleText : "",
                    subscriber: result.videoCountText ? result.videoCountText.simpleText.split(" ")[0] : "",
                    description: (_13 = (_12 = (_11 = (_10 = result.descriptionSnippet) === null || _10 === void 0 ? void 0 : _10.runs) === null || _11 === void 0 ? void 0 : _11.filter(({ text }) => text)) === null || _12 === void 0 ? void 0 : _12.map(({ text }) => text)) === null || _13 === void 0 ? void 0 : _13.join(''),
                    type: typeName.replace(/Renderer/i, '')
                 });
              }
              if (isMix) {
                 results.playlist.push({
                    playlistId: result.playlistId,
                    title: result.title.simpleText,
                    thumbnail: result.thumbnail.thumbnails.pop().url,
                    video: result.videos.map(({ childVideoRenderer }) => {
                       return {
                           url: encodeURI('https://www.youtube.com/watch?v=' + childVideoRenderer.videoId + "&list=" + result.playlistId),
                           videoId: childVideoRenderer.videoId,
                           title: childVideoRenderer.title.simpleText,
                           durationH: childVideoRenderer.lengthText.accessibility.accessibilityData.label,
                           duration: childVideoRenderer.lengthText.simpleText
                       };
                    }),
                    type: 'mix'
                 });
              }
           })
         resolve(results)
      })
   })
}
//youtubeSearch('dani')

async function fb(vid_url) {
    try {
        const data = {
            url: vid_url
        };
        const searchParams = new URLSearchParams();
        searchParams.append('url', data.url);
        const response = await fetch('https://facebook-video-downloader.fly.dev/app/main.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: searchParams.toString(),
        });
        const responseData = await response.json();
        return responseData;
    } catch (e) {
        return null;
    }
}

async function shorts(q) {
  const params = {
    engine: "youtube",
    search_query: q,
    api_key: "279b94ff6c351fb61509b7dc17bbb338261ff7063af9ce2e0d3295bca96d596d"
  };

  try {
    const response = await axios.get("https://serpapi.com/search", { params });
    return response.data.shorts_results;
  } catch (error) {
    console.error("Error fetching YouTube shorts results:", error.message);
    return null;
  }
}

//getYouTubeShorts()

async function highid(id) {
  const url = `https://api-ig.storiesig.info/api/highlightStories/highlight:${id}`;

  try {
    const response = await axios.get(url);
    return response.data; // Mengembalikan data dari respons
  } catch (error) {
    console.error('Error fetching highlight stories:', error);
    throw error;
  }
}
//fetchHighlightStories(17848797404251086)

async function getFacebookProfilePicture(fbUrl) {
    const options = {
        method: 'GET',
        url: 'https://facebook-profile-picture-viewer.p.rapidapi.com/',
        params: {
            fburl: fbUrl
        },
        headers: {
            'x-rapidapi-key': 'e3b0d82e96msh073b3e47bc51fa3p154f0cjsn3678a4eeb7fd',
            'x-rapidapi-host': 'facebook-profile-picture-viewer.p.rapidapi.com'
        }
    };

    try {
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching profile picture: ${error.message}`);
    }
}

// Contoh panggilan fungsi
/*(async () => {
    try {
        const data = await getFacebookProfilePicture('https://www.facebook.com/amanda.putryr23?mibextid=ZbWKwL');
        console.log(data); // Hapus ini jika tidak ingin menampilkan output
    } catch (error) {
        console.error(error.message);
    }
})();*/

async function profilefb(fbUrl) {
    const apiUrl = `https://dinona.info/getImages?fburl=${encodeURIComponent(fbUrl)}`;

    try {
        const response = await axios.get(apiUrl);
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching profile image: ${error.message}`);
    }
}
//gettFacebookProfileImage('www.facebook.com/Zuck');

async function fotofb(fbUrl) {
  try {
    const { data } = await axios.post(
      "https://www.expertstool.com/download-pinterest-video/",
      new URLSearchParams({ url: fbUrl }).toString(),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
          referer: "https://www.expertstool.com/facebook-image-downloader/",
        },
      }
    );

    const $ = cheerio.load(data);

    let result = {
      images: [],
    };

    // ambil link gambar (jika ada)
    $("div.col-sm-12 a img").each((i, el) => {
      const img = $(el).attr("src");
      if (img && img.startsWith("http")) {
        result.images.push(img);
      }
    });

    return result;
  } catch (err) {
    return { error: err.message };
  }
}

async function fbstories(url) {
    try {
        const data = qs.stringify({
            page: url,
            ftype: 'all',
            ajax: '1'
        });

        const response = await axios.post('https://fbtake.com/facebook-story-downloader/', data, {
            headers: {
                'authority': 'fbtake.com',
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://fbtake.com',
                'referer': 'https://fbtake.com/facebook-story-downloader/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        const $ = cheerio.load(response.data);
        
        // Perbaikan selector untuk videoSrc
        const videoSrc = $('.story_media source').attr('src');
        const downloadHD = $('.btn-primary.btn-dl').attr('href');
        const downloadSD = $('.btn-success.btn-dl').attr('href');

        return {
            status: true,
            result: {
                videoUrl: videoSrc,
                quality: {
                    HD: downloadHD,
                    SD: downloadSD
                }
            }
        };
    } catch (error) {
        return {
            status: false,
            message: error.message
        };
    }
}
//fbstories('https://www.facebook.com/stories/122094575186386701/UzpfSVNDOjE1OTc0MDQ0ODc4NDIyMjM=/?view_single=1&source=shared_permalink&mibextid=XUfhQ2')

async function fbdownlod(url) {
  if (!url) throw new Error("Masukkan URL Facebook");

  try {
    // Request ke getvidfb.com
    const response = await axios.post(
      "https://getvidfb.com/",
      new URLSearchParams({
        url,
        lang: "id",
        type: "redirect"
      }).toString(),
      {
        headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://getvidfb.com',
        'referer': 'https://getvidfb.com/id/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        },
      }
    );

    const html = response.data;
    const $ = cheerio.load(html);

    // Ambil semua link download dari tombol
    const links = [];
    $("a.abutton").each((i, el) => {
      const href = $(el).attr("href");
      if (href) links.push({ url: href });
    });

    // Return hasil array, bukan console.log
    return links;
  } catch (err) {
    // Return error sebagai object
    return { error: err.message };
  }
}

class YT {
  constructor() {}
  url() {
    try {
      return "https://v1.yt1s.biz";
    } catch (e) {
      console.error("Error in url:", e);
      throw e;
    }
  }
  headers() {
    try {
      return {
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        origin: this.url()
      };
    } catch (e) {
      console.error("Error in headers:", e);
      throw e;
    }
  }
  validate(str) {
    try {
      if (typeof str !== "string" || !str?.trim()?.length) {
        throw new Error("Input tidak boleh kosong");
      }
    } catch (e) {
      console.error("Error in validate:", e.message);
      throw e;
    }
  }
  getVideoId(url) {
    try {
      this.validate(url);
      const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const match = url.match(regex);
      if (match && match[1]) {
        return match[1];
      }
      throw new Error("URL YouTube tidak valid atau tidak mengandung Video ID");
    } catch (e) {
      console.error("Error in getVideoId:", e.message);
      throw e;
    }
  }
  format(userFormat) {
    try {
      const formats = ["64kbps", "96kbps", "128kbps", "256kbps", "320kbps", "144p", "240p", "360p", "480p", "720p", "1080p"];
      if (!formats.includes(userFormat)) {
        throw new Error(`Format tidak valid. Pilih dari: ${formats.join(", ")}`);
      }
      const path = /p$/.test(userFormat) ? "/video" : "/audio";
      const quality = userFormat.match(/\d+/)[0];
      return { path, quality };
    } catch (e) {
      console.error("Error in format:", e.message);
      throw e;
    }
  }
  async req(url, opts, returnType = "json") {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) {
      throw new Error(`${r.status} ${r.statusText} ${await r.text() || ""}`);
    }

    const text = await r.text();
    if (returnType === "json") {
      try {
        return JSON.parse(text);
      } catch {
        // Kalau gagal parse JSON, kembalikan text
        return text;
      }
    } else if (returnType === "text") {
      return text;
    } else {
      return { headers: r.headers };
    }
  } catch (e) {
    console.error(`Request failed:`, e);
    throw e;
  }
}
  async token() {
    try {
      console.log("[Getting session token]");
      const { headers } = await this.req("https://fast.dlsrv.online/", {
        headers: this.headers()
      }, "headers");
      const session = headers.get("x-session-token");
      if (!session) throw new Error("Gagal mendapatkan session token");
      console.log("[Session token acquired]");
      return session;
    } catch (e) {
      console.error("Error getting token:", e.message);
      throw e;
    }
  }
  pow(session, path) {
    try {
      let nonce = 0;
      console.log("[Executing Proof of Work]");
      while (true) {
        const data = `${session}:${path}:${nonce}`;
        const powHash = crypto.createHash("SHA256").update(data).digest("hex");
        if (powHash.startsWith("0000")) {
          console.log("[Proof of Work successful]");
          return { nonce: nonce.toString(), powHash };
        }
        nonce++;
      }
    } catch (e) {
      console.error("Error in pow:", e.message);
      throw e;
    }
  }
  sign(session, path, timestamp) {
    try {
      const data = `${session}:${path}:${timestamp}`;
      const key = "a8d4e2456d59b90c8402fc4f060982aa";
      return crypto.createHmac("SHA256", key).update(data).digest("hex");
    } catch (e) {
      console.error("Error in sign:", e.message);
      throw e;
    }
  }
  async download({ url, format: userFormat = "128kbps" }) {
  try {
    const videoId = this.getVideoId(url);
    const { path, quality } = this.format(userFormat);
    const session = await this.token();
    const timestamp = Date.now().toString();
    const signature = this.sign(session, path, timestamp);
    const { nonce, powHash } = this.pow(session, path);

    const headers = {
      ...this.headers(),
      "content-type": "application/json",
      "x-api-auth": "Ig9CxOQPYu3RB7GC21sOcgRPy4uyxFKTx54bFDu07G3eAMkrdVqXY9bBatu4WqTpkADrQ",
      "x-session-token": session,
      "x-signature": signature,
      "x-signature-timestamp": timestamp,
      nonce: nonce,
      powhash: powHash
    };

    const body = JSON.stringify({ videoId, quality });

    // Panggil req dengan returnType "text" agar aman dari error JSON
    const result = await this.req(`https://fast.dlsrv.online/gateway/${path}`, {
      headers,
      body,
      method: "post"
    }, "text");

    return result; // <- hasil berupa link download atau data plain text
  } catch (e) {
    console.error("Error during download:", e.message);
    throw e;
  }
}
}

class Youtubers {
  constructor() {
    this.hex = "C5D58EF67A7584E4A29F6C35BBC4EB12";
  }
 
  async uint8(hex) {
    const pecahan = hex.match(/[\dA-F]{2}/gi);
    if (!pecahan) throw new Error("Format tidak valid");
    return new Uint8Array(pecahan.map(h => parseInt(h, 16)));
  }
 
  b64Byte(b64) {
    const bersih = b64.replace(/\s/g, "");
    const biner = atob(bersih);
    const hasil = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) hasil[i] = biner.charCodeAt(i);
    return hasil;
  }
 
  async key() {
    const raw = await this.uint8(this.hex);
    return await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"]);
  }
 
  async Data(base64Terenkripsi) {
    const byteData = this.b64Byte(base64Terenkripsi);
    if (byteData.length < 16) throw new Error("Data terlalu pendek");
 
    const iv = byteData.slice(0, 16);
    const data = byteData.slice(16);
 
    const kunci = await this.key();
    const hasil = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      kunci,
      data
    );
 
    const teks = new TextDecoder().decode(new Uint8Array(hasil));
    return JSON.parse(teks);
  }
 
  async getCDN() {
    const res = await fetch("https://media.savetube.me/api/random-cdn");
    const data = await res.json();
    return data.cdn;
  }
 
  async infoVideo(linkYoutube) {
    const cdn = await this.getCDN();
    const res = await fetch(`https://${cdn}/v2/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkYoutube }),
    });
 
    const hasil = await res.json();
    if (!hasil.status) throw new Error(hasil.message || "Gagal ambil data video");
 
    const isi = await this.Data(hasil.data);
    return {
      judul: isi.title,
      durasi: isi.durationLabel,
      thumbnail: isi.thumbnail,
      kode: isi.key,
      kualitas: isi.video_formats.map(f => ({
        label: f.label,
        kualitas: f.height,
        default: f.default_selected
      })),
      infoLengkap: isi
    };
  }
 
  async getDownloadLink(kodeVideo, kualitas, type) {
    const cdn = await this.getCDN();
    const res = await fetch(`https://${cdn}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        downloadType: kualitas === "128" ? "audio" : type,
        quality: kualitas,
        key: kodeVideo,
      }),
    });
 
    const json = await res.json();
    if (!json.status) throw new Error(json.message);
    return json.data.downloadUrl;
  }
 
  async downloadyt(linkYoutube, kualitas, type) {
    try {
      const data = await this.infoVideo(linkYoutube);
      const linkUnduh = await this.getDownloadLink(data.kode, kualitas, type);
      return {
        status: true,
        judul: data.judul,
        durasi: data.durasi,
        url: linkUnduh,
      };
    } catch (err) {
      return {
        sukses: false,
        pesan: err.message
      };
    }
  }
}

async function fbdownloader(storyUrl) {
  try {
    const payload = new URLSearchParams();
    payload.append('url', storyUrl);
    payload.append('lang', 'id');
    payload.append('type', 'redirect');

    const response = await axios.post('https://getvidfb.com/', payload.toString(), {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://getvidfb.com',
        'referer': 'https://getvidfb.com/id/facebook-story-download',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const links = [];
    $('.download-block a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });

    return links;
  } catch (err) {
    return { error: err.message };
  }
}

async function downloadfbvid(fbUrl) {
  try {
    const data = qs.stringify({
      p: 'facebook',
      q: fbUrl,
      lang: 'id',
      w: ''
    });

    const response = await axios.post(
      'https://snapsave.io/api/ajaxSearch/facebook',
      data,
      {
        headers: {
          'authority': 'snapsave.io',
          'accept': '*/*',
          'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'origin': 'https://snapsave.io',
          'referer': 'https://snapsave.io/id9/download-facebook',
          'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
          'x-requested-with': 'XMLHttpRequest'
        }
      }
    );

    const $ = cheerio.load(response.data.data); // load HTML
    const videos = [];

    // Ambil link MP4 dari <a> dengan class download-link-fb
    $('a.download-link-fb').each((i, el) => {
      const quality = $(el).text().trim(); // misal "720p (HD)"
      const url = $(el).attr('href');
      if (url) videos.push({ quality, url });
    });

    // Ambil juga dari button data-videourl
    $('button[data-videourl]').each((i, el) => {
      const quality = $(el).attr('data-fquality') || 'unknown';
      const url = $(el).attr('data-videourl');
      if (url) videos.push({ quality, url });
    });

    return videos; // mengembalikan array { quality, url }

  } catch (err) {
    return { error: err.message };
  }
}

async function detail(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const title = $('title').text().trim(); 
        const link = url; 
        const description = $('meta[name="description"]').attr('content') || 
            $('meta[property="og:description"]').attr('content'); 
        const price = $('.game_purchase_price').first().text().trim() || 
            $('.discount_final_price').first().text().trim(); 
        const media = $('meta[property="og:image"]').attr('content'); 
        const genres = [];
        
        // Selector for genres
        $('.glance_tags .app_tag').each((index, element) => {
            genres.push($(element).text().trim());
        });
        
        const genreString = genres.join(', '); 

        // Extracting additional information
        const developer = $('div.dev_row a').first().text().trim(); 
        const publisher = $('div.dev_row a').last().text().trim(); 
        const release = $('div.date').text().trim(); 
        
        // Mengambil Persyaratan Sistem
        const systemRequirements = {
            minimum: {}
        };

        const requirements = $('.game_area_sys_req');
        if (requirements.length) {
            const reqText = requirements.text().trim();
            const processor = reqText.match(/Processor:\s*(.*?)(?=\n)/);
            const memory = reqText.match(/Memory:\s*(.*?)(?=\n)/);
            const graphics = reqText.match(/Graphics:\s*(.*?)(?=\n)/);
            const storage = reqText.match(/Storage:\s*(.*?)(?=\n)/);

            system = {
                processor: processor ? processor[1].trim() : 'N/A',
                memory: memory ? memory[1].trim() : 'N/A',
                graphics: graphics ? graphics[1].trim() : 'N/A',
                storage: storage ? storage[1].trim() : 'N/A'
            };
        } else {
            system = {
                processor: 'No system requirements found',
                memory: 'No system requirements found',
                graphics: 'No system requirements found',
                storage: 'No system requirements found'
            };
        }

        const result = {
            title,
            link,
            description,
            price,
            media,
            genres: genreString, 
            developer,
            publisher,
            release,
            system // Menambahkan persyaratan sistem
        };

        return result;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null; 
    }
}

//detail('https://store.steampowered.com/app/1671200/Honkai_Impact_3rd/')

async function steam(query) {
  const url = `https://store.steampowered.com/search/?term=${encodeURIComponent(query)}&supportedlang=indonesian&ndl=1`;

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const products = [];

    $('.search_result_row').each((index, element) => {
      const title = $(element).find('.title').text().trim();
      const link = $(element).attr('href');
      const media = $(element).find('.search_capsule img').attr('src');

      products.push({
        title,
        link,
        media,
      });
    });

    return products;
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}
//steam("honkai")

async function getData(nomor) {
  const options = {
    method: 'GET',
    url: `https://whatsapp-data1.p.rapidapi.com/number/${nomor}`,
    headers: {
      'x-rapidapi-key': 'e3b0d82e96msh073b3e47bc51fa3p154f0cjsn3678a4eeb7fd',
      'x-rapidapi-host': 'whatsapp-data1.p.rapidapi.com'
    }
  };

  try {
    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function bilibili(url) {
  const requestBody = `url=${encodeURIComponent(url)}&token=53f095f92a8210f4799b893ac4192bd66fbf5404f537d4dbe74ac9db0b85f71e&hash=aHR0cHM6Ly93d3cuYmlsaWJpbGkuY29tL3ZpZGVvL0JWMWN5NHkxazdBMg%3D%3D1043YWlvLWRs`;

  const options = {
    method: "POST",
    headers: {
      "accept": "*/*",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": "\"Android\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "cookie": "PHPSESSID=e61693c5f13c313ab2c614c2836e3239; pll_language=en; isFTime_831c552d9edaf994a8f9a3fb9b2ecc54=true; isFTime_831c552d9edaf994a8f9a3fb9b2ecc54_expiry=Sat, 02 Nov 2024 00:04:10 GMT; sb_main_25487d0c7ea9897588de5e9383d5b500=1; sb_count_25487d0c7ea9897588de5e9383d5b500=1; dom3ic8zudi28v8lr6fgphwffqoz0j6c=be742332-691e-4e37-8be2-6254be315e6b%3A3%3A1",
      "Referer": "https://snapsave.cc/bilibili-video-downloader/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    body: requestBody
  };

  try {
    const response = await fetch("https://snapsave.cc/wp-json/aio-dl/video-data/", options);

    if (!response.ok) throw new Error(`Error: ${response.statusText}`);

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error :", error);
  }
}

//bilibili("https://www.bilibili.com/video/BV1cy4y1k7A2")

async function tiktokprofile(username) {
    const Body = {
        query: username,
        language_id: "1",
        refresh_token: "b9f4ba4cb1b7e88ea46fb882f936437a"
    };

    try {
        const response = await axios.post("https://ttsave.app/download", Body, {
            headers: {
                "accept": "application/json, text/plain, */*",
                "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                "content-type": "application/json",
                "sec-ch-ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
                "sec-ch-ua-mobile": "?1",
                "sec-ch-ua-platform": "\"Android\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "Referer": "https://ttsave.app/en/profile",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        });

        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
            return response.data;
        } else {
            const $ = cheerio.load(response.data);
            
            const username = $('h2').text().trim();
            let urlimage = $('a[target="_blank"] img').attr('src');

            if (urlimage) {
                profileImageUrl = urlimage.replace(/~tplv-tiktokx-cropcenter-q:[0-9]+:[0-9]+:q[0-9]+/, '~tplv-tiktokx-cropcenter-q:1080:1080:q80');
            }

            return { username, urlimage };
        }

    } catch (error) {
        if (error.response) {
            return {
                error: true,
                message: error.message,
                responseData: error.response.data,
                responseStatus: error.response.status
            };
        } else {
            return {
                error: true,
                message: error.message
            };
        }
    }
}

//tiktokprofile()

async function scrapeTikTokFollowerData(username) {
    try {
        const url = `https://collabstr.com/tiktok-fake-follower-checker/${username}`;
        const { data } = await axios.get(url);

        const $ = cheerio.load(data);

        const profilePicture = $('.report-prof-pic').attr('src');
        const reportUsername = $('.report-username').text().trim();
        const followersCount = $('.report-prof-detail').eq(0).find('.report-prof-num').text().trim();
        const followingCount = $('.report-prof-detail').eq(1).find('.report-prof-num').text().trim();
        const postsCount = $('.report-prof-detail').eq(2).find('.report-prof-num').text().trim();
        const engagementRate = $('.report-nums-holder').find('.report-prof-num').eq(0).text().trim();
        const averageLikes = $('.report-nums-holder').find('.report-prof-num').eq(1).text().trim();
        const averageComments = $('.report-nums-holder').find('.report-prof-num').eq(2).text().trim();
        const suspiciousFollowers = $('.report-num-holder').eq(0).find('.report-num').text().trim();
        const realFollowers = $('.report-num-holder').eq(1).find('.report-num').text().trim();

        // Mengembalikan hasil sebagai objek
        return {
            username: reportUsername,
            profilePicture: profilePicture || 'Profile picture not found',
            followers: followersCount,
            following: followingCount,
            posts: postsCount,
            engagementRate: engagementRate || 'Engagement rate not found',
            averageLikes: averageLikes || 'Average likes not found',
            averageComments: averageComments || 'Average comments not found',
            suspiciousFollowers: suspiciousFollowers,
            realFollowers: realFollowers,
        };

    } catch (error) {
        return { error: 'Error fetching data: ' + error.message }; // Mengembalikan error jika terjadi kesalahan
    }
}

// Ganti 'dhotdesign' dengan username yang ingin Anda periksa
//scrapeTikTokFollowerData('dhotdesign')

async function scrapeRecipe(url) {
    try {
        // Mengambil HTML dari URL
        const { data } = await axios.get(url);
        
        // Memuat HTML ke cheerio
        const $ = cheerio.load(data);

        // Mengambil informasi resep
        const title = $('title').text().trim();
        const description = $('meta[name="description"]').attr('content');
        const image = $('meta[property="og:image"]').attr('content');

        // Mengambil bahan
        const ingredients = [];
        $('.single-ingredients table.ingredients-table tr').each((index, element) => {
            const ingredient = $(element).find('td').eq(1).text().trim(); // Ambil kolom kedua (bahan)
            if (ingredient) {
                ingredients.push(ingredient);
            }
        });

        // Mengambil langkah-langkah
        const instructions = [];
        $('.single-steps .single-step-description').each((index, element) => {
            const step = $(element).text().trim();
            if (step) {
                instructions.push(step);
            }
        });

        // Mengembalikan hasil sebagai objek
        return {
            title,
            description,
            image,
            ingredients,
            instructions
        };
    } catch (error) {
        throw new Error('Error: ' + error.message);
    }
}

// Ganti dengan URL yang sesuai
/*const url = 'https://resepkoki.id/resep/resep-ayam-geprek-keju/';
scrapeRecipe(url)*/

async function scrapeRecipeData(query) {
    try {
        const url = `https://resepkoki.id/search/${encodeURIComponent(query)}/`;
        const { data } = await axios.get(url);
        
        // Mencetak data HTML untuk pemeriksaan (opsional)
        // console.log(data); // Uncomment untuk melihat respons HTML

        const $ = cheerio.load(data);
        const recipes = [];

        // Mengambil semua tautan dari hasil pencarian
        $('.archive-item').each((index, element) => {
            const title = $(element).find('.entry-title a').text().trim();
            const link = $(element).find('.entry-title a').attr('href');
            const image = $(element).find('.archive-item-media img').attr('data-src') || $(element).find('.archive-item-media img').attr('src');
            const categories = [];
            $(element).find('.archive-item-meta-categories .post-categories a').each((i, categoryElement) => {
                categories.push($(categoryElement).text().trim());
            });

            if (title && link) {
                recipes.push({ title, link, image, categories });
            }
        });

        return recipes; // Mengembalikan array resep
    } catch (error) {
        console.error('Error fetching data:', error);
        return []; // Mengembalikan array kosong jika terjadi error
    }
}

// Memanggil fungsi dengan parameter query
//scrapeRecipeData('ayam Geprek')

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function shopee(keyword) {
  try {
    await delay(10000);

    const response = await axios.get('https://shopee.co.id/api/v4/search/search_items', {
      params: {
        by: 'relevancy',
        extra_params: '{"global_search_session_id":"gs-855a2909-35f3-48cf-84a6-d4d4af517172","search_session_id":"ss-c29e3f1d-1389-4976-b6d4-b69c9a7d464b"}',
        keyword: keyword,
        limit: 20,
        newest: 0,
        order: 'desc',
        page_type: 'search',
        scenario: 'PAGE_GLOBAL_SEARCH',
        version: 2,
        view_session_id: '8113c1e2-cdef-4ec2-9bec-8b20258edae8'
      },
      headers: {
        'accept': 'application/json',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/json',
        'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-api-source': 'rweb',
        "x-csrftoken": "kijw0yAbZkzyuqVgvUBNJRyfSkMz08Db",
    "x-requested-with": "XMLHttpRequest",
    "x-sap-ri": "d1a92c67f274233cca4bcb3a05011fba59141c2e3aa8dfe77533",
    "x-sap-sec": "7hthpv64GA50mWjYlArYlW2Y2ArflFbYWAk8l1XYb5PvlWjYAAPqlWXYXAk2lVNYjAk7lArYN5PilVHY1RrglWNYaAkBlWrYT5kKlT5YCAr/lFrY3Rr8l8jYDArylDXY6RPmlW6YmAPTlAbY8AP0lUXYMRr4lXNYLAPklTpYKAr1lTrYG5kElArYFAHYlArYyho3o5PveOSO9mXClArYlArwM6EQxSM1p+6YlDqLkApYlArYFVQ9l5rYlArUcj8TvIXuOG6Fozb0sgnlvguYl9IxsgrGcy5m09I3EMTJlArYTcwPkX6Y/vz/BYV5b5rY94C2pXQIaAHYlUgZlFAY/QkK3YBnnRrYlqAYlVrJdApYlArYl139l5rYlAk1R1jClAPYf41XaArYlArYlnkkl5rYlArY1tw724l1l5rYmArYlAXYlAPpIrri6Gtg5frwlAO4SQHaryGkttiU6QMM5dwCU2qQN01TDwmADCZAl2kY1zu9GE3wtavElW67pjWPFYZkyiv/i1YawGll6bWpB8hBiPrNZEiEJviKhc/hPUGY5xDlmBxy/ozIOixgGEYOfG8iVRtJMj7LSk57xi/057lFk25EIywqOx+kEUNtnDZ4R1ofJYiWsPko8aWgcsbA32sYmvFqWDNoH5qbhzvAIP86mdCEmy6RKx5R3RYFTrTLORjft+6hcEd2tjKj/M7Ojfczcs6iyE2s9wLHGcO4YwIaTsF4DweEx7/vPmfpUrsbQy9Sk8W2/19VpSM9dDhs0omP/kobyXi1t/tk8SeOBF3kcZuSpbbvDyItiAvC2vOT09nvZUivFhBBfN7YbLqmkjc60VL/Dv58HQPKcElEVB73EZIldAyWjCOJ3GIXjHpvfYNLJ7rl60qKDDkfSlSTY0o1PGjjiATF0bMFxz1XriGwpG+dRGvqCEj4kWtouokNFwrYlArV1ee7H5dCiXXTMecvP3GTljy8MGS+sYHIMmGg6wjvnbUQSgQtApChg9SkXscXbHZs7Rj3IhfCAytkBwRoVKQeyyaaNL+m3wleeAnGBDEh7N1MNeEPtuAtKNq19pWST6jJScsI6QlCDWuJx8rAVbcoEk3PoLx8UviyF4am4J/X9wf8A2kuTyB0W1gbEoMNLhSUUm89wg5MCFLhgKOv/pyNt1TAwWBKoCnMIvF90NT4Wa5epdXSD2SgkD4u12uml8zalArYXX+S+5NYlAPPG4hiyRrYlUYIhXSBXOVZ6fnclApYlAOvy5rYmRrYlqw0255MlmuYzArYltj/LzH2zgkfs8PhgRrYlArklArY3O3IFf+8tNm3qtaZtk5+TU2RE453zO7momlNDfyutNZduLoxn9AdjUw+2Np2Xf7moJnMFckubdXYlArYyArYlD2pUDTLUDRelArYlAXYlAPFAoqhF89laC==",
    "x-shopee-language": "id",
    "x-sz-sdk-version": "1.12.5",
    "cookie": "__LOCALE__null=ID; csrftoken=kijw0yAbZkzyuqVgvUBNJRyfSkMz08Db; _sapid=99d6039d865429fa9c8bcf9ffc32999f318541b51fe1e59fed14d9a1; _QPWSDCXHZQA=c2591679-561f-4737-cf79-21fdba882dec; REC7iLP4Q=b59a75b2-568e-4384-a530-f6ce9949f628; SPC_SI=M+kpZwAAAABVTDR6NE5IScQuBwAAAAAAZjh3Rm5Rdks=; SPC_F=mS86U82tMH2B79L8PJIWJTKEB3uXQYly; REC_T_ID=d53938d3-9bb5-11ef-ad2c-32ceca065c63; _gcl_aw=GCL.1730839076.EAIaIQobChMI1e6dqoXGiQMV1hyDAx0Z2C5wEAAYASAAEgIhUfD_BwE; _gcl_gs=2.1.k1$i1730839068$u156485241; _gcl_au=1.1.1229757513.1730839077; _med=cpc; _fbp=fb.2.1730839080215.184553358944251221; SPC_CLIENTID=bVM4NlU4MnRNSDJCbnzjznfcfnxoqvgo; _ga=GA1.3.406628386.1730839090; _ga_SW6D8G0HXK=GS1.1.1730839090.1.1.1730840748.56.0.0; SPC_U=1397854454; SPC_R_T_ID=BehM74WwL+IPea6+PsyfGZ62E/F/frmcUSPoCcJ4w79anXnCX/kQddTeq/F3ZmMNyCdBckhLj5XMh/zAZmNKOhcsMV+CvQp+i4RIR+ewnlCv/6Vbfa1D1oxJeCVUB2ciCuf2oDAQGpE325fz9rWLpbkP/ZkZB2si70xRc5LWsw0=; SPC_R_T_IV=cFBCbEJMQUZvekRSNHpaNA==; SPC_T_ID=BehM74WwL+IPea6+PsyfGZ62E/F/frmcUSPoCcJ4w79anXnCX/kQddTeq/F3ZmMNyCdBckhLj5XMh/zAZmNKOhcsMV+CvQp+i4RIR+ewnlCv/6Vbfa1D1oxJeCVUB2ciCuf2oDAQGpE325fz9rWLpbkP/ZkZB2si70xRc5LWsw0=; SPC_T_IV=cFBCbEJMQUZvekRSNHpaNA==; SPC_SEC_SI=v1-Q3ByZmJuU0FRY2VmazM5ZA3XIVNK/aBfO8elzV2ziIGLYxX4+yJ2VsVzSbtOrfR13JhFokORuWPPU7bc8W2WYD2P6js0oYQTzMu86Zee8gU=; SPC_EC=.Y25sVHVFNTJ5ZmlWV1R3ORkCRYG1KTc0Vuh1OHLs5Lp/qq9n9OK/ZRPF8LdT2iDzo2wPMHByD+6zzObXsjbVImp64khe+5G6zqzFiY+KtH/gj25MpsKb7dPP+rSWiOYwdgc6bGQCioRW9lbSfX4dBUBYtm8KHKEXANUWGKsUQt5degKwiJ/qxVzRlrzd3NYz2CcSUirYoSTRcY9MP2m7DzPgHOkfkUFOvnFhABHjY9WugTj8wYlvY4CvQ1gmwko1; SPC_ST=.Y25sVHVFNTJ5ZmlWV1R3ORkCRYG1KTc0Vuh1OHLs5Lp/qq9n9OK/ZRPF8LdT2iDzo2wPMHByD+6zzObXsjbVImp64khe+5G6zqzFiY+KtH/gj25MpsKb7dPP+rSWiOYwdgc6bGQCioRW9lbSfX4dBUBYtm8KHKEXANUWGKsUQt5degKwiJ/qxVzRlrzd3NYz2CcSUirYoSTRcY9MP2m7DzPgHOkfkUFOvnFhABHjY9WugTj8wYlvY4CvQ1gmwko1; shopee_webUnique_ccd=BhTm0XSVGzVeQZFGcxgZQw%3D%3D%7C0hjY6fs1CdAtZizFktryrtjO1Zme27I8ligskhOLFdr1wkNb3yqn0Cf5FvUE9Knp7Zpjkp8acQyJXw7odPg%3D%7Cpt%2FwxejaZRS6fgC2%7C08%7C3; ds=c4c8895784de77ac66697c934c9c67b7",
    "Referer": `https://shopee.co.id/search?keyword=${keyword}`,
    "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });

    const items = response.data.items || [];

    const products = items.map((item) => {
      if (item && item.item_basic) {
        return {
          title: item.item_basic.name || "undefined",
          price: item.item_basic.price ? item.item_basic.price / 100000 : "undefined",
          image: item.item_basic.image
            ? `https://cf.shopee.co.id/file/${item.item_basic.image}`
            : "undefined",
          link: item.item_basic.shopid && item.item_basic.itemid
            ? `https://shopee.co.id/product/${item.item_basic.shopid}/${item.item_basic.itemid}`
            : "undefined",
          shop_name: item.item_basic.shop_name || "undefined",
          shop_location: item.item_basic.shop_location || "undefined",
          shopee_verified: item.item_basic.shopee_verified || false,
          sold: item.item_basic.sold || 0,
          total_count: item.item_basic.stock || 0
        };
      }
      return null;
    }).filter(product => product !== null);

    return products;
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
}

//shopee('tas')

async function tokopedia(q) {
  const url = 'https://gql.tokopedia.com/graphql/SearchProductV5Query';

  const headers = {
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'X-Source': 'tokopedia-lite',
    'X-Tkpd-Lite-Service': 'phoenix',
    'X-Version': '1a7a6f9',
    'Accept': '*/*',
    'bd-device-id': '1253105214511381244',
    'bd-web-id': '1253105214511381244',
    'Content-Type': 'application/json',
    'iris_session_id': '',
    'Referer': `https://www.tokopedia.com/search?enter_method=normal_search&navsource=home&q=${q}&srp_component_id=02.01.00.00&t_id=1730766879914&t_st=1&t_pp=homepage&t_efo=&t_ef=homepage&t_sm=&t_spt=`,
    'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'tkpd-userid': '0',
    'x-dark-mode': 'false',
    'x-device': 'mobile'
  };

  const data = [
    {
      "operationName": "SearchProductV5Query",
      "variables": {
        "cursor": "vszpxh",
        "searchProductV5Param": `device=mobile&enable_lite_deduplication=true&enter_method=normal_search&l_name=sre&navsource=home&ob=23&page=1&q=${q}&rows=8&source=search&srp_component_id=02.01.00.00&t_ef=homepage&t_efo=&t_id=1730766879914&t_pp=homepage&t_sm=&t_spt=&t_st=1&unique_id=b4b09b4a237ef0bbda9c43f618df91b7&use_page=true&user_addressId=&user_cityId=176&user_districtId=2274&user_id=&user_lat=0&user_long=0&user_postCode=&user_warehouseId=0&warehouses=`
      },
      "query": "query SearchProductV5Query($searchProductV5Param: String!) { searchProductV5(params: $searchProductV5Param) { data { products { id name url price { text number } mediaURL { image } } } } }"
    }
  ];

  try {
    const response = await axios.post(url, data, { headers });
    const products = response.data[0].data.searchProductV5.data.products;

    const productDetails = products.map(product => ({
      title: product.name,
      price: product.price.text,
      image: product.mediaURL.image,
      link: product.url
    }));

    return productDetails;
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

//tokopedia('tas')

async function pinstalk(username, cookies = "") {
  if (!username) {
    return {
      status: false,
      code: 400,
      result: { message: "Username cannot be empty." },
    };
  }

  const baseURL = "https://www.pinterest.com";
  const headers = {
    accept: "application/json, text/javascript, */*, q=0.01",
    referer: "https://www.pinterest.com/",
    "user-agent": "Postify/1.0.0",
    "x-app-version": "xxx",
    "x-pinterest-appstate": "active",
    "x-pinterest-pws-handler": "www/[username]/[slug].js",
    "x-pinterest-source-url": `/${username}/`,
    "x-requested-with": "XMLHttpRequest",
    cookie: cookies,
  };

  const client = axios.create({ baseURL, headers });

  if (!cookies) {
    try {
      const res = await client.get("/");
      const setCookies = res.headers["set-cookie"];
      if (setCookies) {
        cookies = setCookies.map(c => c.split(";")[0].trim()).join("; ");
        client.defaults.headers.cookie = cookies;
      }
    } catch (err) {
      return {
        status: false,
        code: 500,
        result: { message: "Failed to initialize cookies." },
      };
    }
  }

  try {
    const params = {
      source_url: `/${username}/`,
      data: JSON.stringify({
        options: {
          username,
          field_set_key: "profile",
          isPrefetch: false,
        },
        context: {},
      }),
      _: Date.now(),
    };

    const { data } = await client.get("/resource/UserResource/get/", { params });

    if (!data.resource_response?.data) {
      return {
        status: false,
        code: 404,
        result: { message: "User not found." },
      };
    }

    const userx = data.resource_response.data;
    return {
      data: {
        id: userx.id,
        username: userx.username,
        full_name: userx.full_name || "",
        bio: userx.about || "",
        email: userx.email || null,
        type: userx.type || "user",
        profile_url: `https://pinterest.com/${userx.username}`,
        image: {
          small: userx.image_small_url || null,
          medium: userx.image_medium_url || null,
          large: userx.image_large_url || null,
          original: userx.image_xlarge_url || null,
        },
        stats: {
          pins: userx.pin_count || 0,
          followers: userx.follower_count || 0,
          following: userx.following_count || 0,
          boards: userx.board_count || 0,
          likes: userx.like_count || 0,
          saves: userx.save_count || 0,
        },
        website: userx.website_url || null,
        domain_url: userx.domain_url || null,
        domain_verified: userx.domain_verified || false,
        explicitly_followed_by_me: userx.explicitly_followed_by_me || false,
        implicitly_followed_by_me: userx.implicitly_followed_by_me || false,
        location: userx.location || null,
        country: userx.country || null,
        is_verified: userx.verified_identity || false,
        is_partner: userx.is_partner || false,
        is_indexed: userx.indexed || false,
        is_tastemaker: userx.is_tastemaker || false,
        is_employee: userx.is_employee || false,
        is_blocked: userx.blocked_by_me || false,
        meta: {
          first_name: userx.first_name || null,
          last_name: userx.last_name || null,
          full_name: userx.full_name || "",
          locale: userx.locale || null,
          gender: userx.gender || null,
          partner: {
            is_partner: userx.is_partner || false,
            partner_type: userx.partner_type || null,
          },
        },
        account_type: userx.account_type || null,
        personalize_pins: userx.personalize || false,
        connected_to_etsy: userx.connected_to_etsy || false,
        has_password: userx.has_password || true,
        has_mfa: userx.has_mfa || false,
        created_at: userx.created_at || null,
        last_login: userx.last_login || null,
        social_links: {
          twitter: userx.twitter_url || null,
          facebook: userx.facebook_url || null,
          instagram: userx.instagram_url || null,
          youtube: userx.youtube_url || null,
          etsy: userx.etsy_url || null,
        },
        custom_gender: userx.custom_gender || null,
        pronouns: userx.pronouns || null,
        board_classifications: userx.board_classifications || {},
        interests: userx.interests || [],
      },
    };
  } catch (error) {
    return {
      status: false,
      code: error.response?.status || 500,
      result: { message: "Server error. Please try again later." },
    };
  }
}

const { runGet, runPost } = require("./turnstile");

async function solveBypass() {
  return {
    solveTurnstileMin: async (url, sitekey) => {
      return "mocked-token-" + Date.now();
    }
  };
}

class BratGenerator {
  constructor() {
    this.url = "https://www.bestcalculators.org/wp-admin/admin-ajax.php";
    this.headers = {
      authority: "www.bestcalculators.org",
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://www.bestcalculators.org",
      referer: "https://www.bestcalculators.org/online-generators/brat-text-generator/",
      "user-agent": "Postify/1.0.0",
      "x-requested-with": "XMLHttpRequest"
    };
  }

  async create(text = "Brat", fontSize = "100", blur = "5") {
    try {
      const data = new URLSearchParams({
        action: "generate_brat_text",
        text,
        fontSize,
        blurLevel: blur
      });

      const { data: base64 } = await axios.post(this.url, data.toString(), {
        headers: this.headers
      });

      return Buffer.from(base64, "base64");
    } catch (err) {
      console.error("Error generating brat image:", err.message);
      throw new Error("Failed to generate image");
    }
  }
}

const Html = require("./list");

class HtmlToImg {
  constructor() {
    this.url = `https://wudysoft.xyz/api/tools/html2img/`;
    this.headers = {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36",
    };
  }

  async getImageBuffer(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer"
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching image buffer:", error.message);
      throw error;
    }
  }
  async generate({
    theme = "flag",
    flagId = "ua",
    profileUrl = "https://png.pngtree.com/thumb_back/fw800/background/20230117/pngtree-girl-with-red-eyes-in-anime-style-backdrop-poster-head-photo-image_49274352.jpg",
    gradient = "45deg, ff7e5f, feb47b",
    pattern = "https://www.toptal.com/designers/subtlepatterns/uploads/dark_embroidery.png",
    model: template = 1,
    type = "v5"
  }) {
    const templateSizes = {
      1: {
        width: 1280,
        height: 1280
      }
    };
    const {
      width,
      height
    } = templateSizes[template] || templateSizes[1];
    const data = {
      width: width,
      height: height,
      html: Html({
        template: template,
        theme: theme,
        flagId: flagId,
        profileUrl: profileUrl,
        gradient: gradient,
        pattern: pattern
      })
    };
    try {
      const response = await axios.post(`${this.url}${type}`, data, {
        headers: this.headers
      });
      if (response.data) {
        return response.data?.url;
      }
    } catch (error) {
      console.error("Error during API call:", error.message);
      throw error;
    }
  }
}

const htmlToImg = new HtmlToImg();

const videy = require("../lib/videy");
const uploader = multer({ storage: multer.memoryStorage() });

async function teraboxdl(url) {
    const config = {
      method: 'GET',
      url: `https://iteraplay.com/pages/download_video.php?url=${url}&ajax=1`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        'sec-ch-ua-platform': '"Android"',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'dnt': '1',
        'sec-ch-ua-mobile': '?1',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'referer': `https://iteraplay.com/pages/download_video.php?url=${url}`,
        'accept-language': 'id,en-US;q=0.9,en;q=0.8,ja;q=0.7',
        'priority': 'u=1, i',
      }
    };
    
    try {    
        const api = await axios.request(config);
        const data = api.data;

        if (!data.success || !data.videos || data.videos.length === 0) {
            return { success: false, message: 'No videos found' };
        }

        // Ambil field yang dibutuhkan
        const result = data.videos.map(video => ({
            judul: video.fileName,
            size: video.fileSize,
            link: video.downloadLink,
            thumbnail: video.thumbnail
        }));

        return { data: result };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

const SpoofHead = (extra = {}) => {
  const ip = [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(256)].join(".");
  const genericHeaders = {
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "client-ip": ip,
    "x-client-ip": ip,
    "x-cluster-client-ip": ip,
    "x-original-forwarded-for": ip
  };
  return {
    ...genericHeaders,
    ...extra
  };
};

class AinanobananaAPI {
  constructor() {
    this.api = axios.create({
      baseURL: "https://ainanobanana.ai/api/",
      headers: {
        accept: "*/*",
        "accept-language": "id-ID",
        origin: "https://ainanobanana.ai",
        referer: "https://ainanobanana.ai/dashboard",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        ...SpoofHead()
      }
    });
    console.log("API client initialized");
  }
  async _upload(imageUrl) {
    console.log(`Uploading image from: ${imageUrl}`);
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      const imageBuffer = Buffer.from(imageResponse.data, "binary");
      const form = new FormData();
      form.append("image", imageBuffer, "image.jpg");
      const uploadResponse = await this.api.post("/upload/image", form, {
        headers: form.getHeaders()
      });
      const uploadedUrl = uploadResponse.data?.url;
      if (!uploadedUrl) {
        throw new Error("Image URL not found in upload response.");
      }
      console.log(`Image uploaded successfully, URL: ${uploadedUrl}`);
      return uploadedUrl;
    } catch (error) {
      console.error("Image upload failed:", error.message);
      throw new Error(error.response?.data?.error || "Failed to upload image");
    }
  }
  async _poll(taskId) {
    console.log(`Polling for taskId: ${taskId}`);
    let attempts = 0;
    const maxAttempts = 60;
    while (attempts < maxAttempts) {
      try {
        const response = await this.api.get(`image/status/${taskId}`);
        const status = response.data?.status;
        console.log(`Poll attempt ${attempts + 1}: Status is ${status}`);
        if (status === 1) {
          console.log("Processing finished successfully.");
          return response.data;
        } else if (status === 2) {
          console.error("Processing failed.");
          throw new Error(response.data?.error || "Generation failed with status 2");
        }
        attempts++;
        await sleep(3e3);
      } catch (error) {
        console.error("Error during polling:", error.message);
        throw error;
      }
    }
    throw new Error("Polling timed out.");
  }
  async img2img({
    prompt,
    imageUrl,
    ...rest
  }) {
    console.log("Starting img2img process...");
    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("addWatermark", rest.addWatermark ?? "true");
      form.append("inputMode", "upload");
      const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        console.log(`Fetching image from ${url}...`);
        const imageResponse = await axios.get(url, {
          responseType: "arraybuffer"
        });
        const imageBuffer = Buffer.from(imageResponse.data, "binary");
        form.append("images", imageBuffer, {
          filename: `image${i}.png`,
          contentType: "image/png"
        });
      }
      console.log("Sending generation request for img2img...");
      const response = await this.api.post("image/generate", form, {
        headers: form.getHeaders()
      });
      const taskId = response.data?.taskId;
      console.log("Received taskId:", taskId);
      if (!taskId) {
        throw new Error("Failed to get taskId from response.");
      }
      return await this._poll(taskId);
    } catch (error) {
      console.error("Error in img2img:", error.message);
      throw new Error(error.response?.data?.error ? error.response.data.error : "An unknown error occurred in img2img");
    }
  }
  async txt2img({
    prompt,
    ...rest
  }) {
    console.log("Starting txt2img process...");
    try {
      const payload = {
        prompt: prompt,
        aspectRatio: rest.aspectRatio || "1:1"
      };
      console.log("Sending generation request with payload:", payload);
      const response = await this.api.post("text-to-image/generate", payload, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      const taskId = response.data?.taskId;
      console.log("Received taskId:", taskId);
      if (!taskId) {
        throw new Error("Failed to get taskId from response.");
      }
      return await this._poll(taskId);
    } catch (error) {
      console.error("Error in txt2img:", error.message);
      throw new Error(error.response?.data?.error ?? "An unknown error occurred in txt2img");
    }
  }
}

class VertexAI {
  constructor() {
    this.api_url = "https://firebasevertexai.googleapis.com/v1beta";
    this.model_url = "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
    this.uploadUrl = `https://wudysoft.xyz/api/tools/upload`;
    this.headers = {
      "content-type": "application/json",
      "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0",
      "x-goog-api-key": "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"
    };
    this.ratio = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    this.model = {
      image: ["imagen-3.0-generate-002", "imagen-3.0-generate-001", "imagen-3.0-fast-generate-001"]
    };
  }

  async image({ prompt, model = "imagen-3.0-generate-002", aspect_ratio = "1:1" } = {}) {
    if (!prompt) throw new Error("Prompt is required");
    if (!this.ratio.includes(aspect_ratio)) throw new Error(`Available ratios: ${this.ratio.join(", ")}`);

    const r = await axios.post(`${this.api_url}/${this.model_url}/${model}:predict`, {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        includeRaiReason: true,
        aspectRatio: aspect_ratio,
        safetySetting: "block_only_high",
        personGeneration: "allow_adult",
        addWatermark: false,
        imageOutputOptions: { mimeType: "image/jpeg", compressionQuality: 100 }
      }
    }, { headers: this.headers });

    if (r.status !== 200) throw new Error("No result found");
    const prediction = r.data.predictions[0];
    if (prediction?.bytesBase64Encoded && prediction?.mimeType) {
      const url = await this.uploadToCatbox({
        bytesBase64Encoded: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType
      });
      return { url, prompt, mime: prediction.mimeType };
    } else {
      throw new Error("No valid image data found in prediction.");
    }
  }

  async uploadToCatbox({ bytesBase64Encoded, mimeType }) {
    const buffer = Buffer.from(bytesBase64Encoded, "base64");
    const formData = new FormData();
    const fileExtension = mimeType.split("/")[1] || "jpg";
    formData.append("file", buffer, `image.${fileExtension}`);
    const response = await axios.post(this.uploadUrl, formData, {
      headers: { ...formData.getHeaders() }
    });
    if (response.status !== 200) throw new Error(`Upload failed: ${response.status}`);
    return response.data?.result;
  }
}

const SOLVER_ENDPOINT = "http://91.99.150.234:3024/api/solve-turnstile-min";

class CaptchaSolver {
  constructor(endpoint = SOLVER_ENDPOINT) {
    this.endpoint = endpoint;
  }

  async _callSolver(payload) {
    const resp = await axios.post(this.endpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
      },
      timeout: 30000
    });
    return resp.data;
  }

  async solve(params) {
    const payload = {
      url: params.url,
      siteKey: params.sitekey || params.siteKey
    };

    if (!payload.url || !payload.siteKey) {
      throw new Error("Missing url or siteKey in payload");
    }

    const raw = await this._callSolver(payload);

    let token;
    if (raw && typeof raw === "object") {
      token = raw.data || raw.token || raw.solution;
    } else if (typeof raw === "string") {
      token = raw;
    }

    if (!token) {
      return { success: false, error: "Upstream did not return token", raw };
    }

    return { success: true, token, raw };
  }
}

const api = {
uploader: 'https://www.aiease.ai/api/api/id_photo/s',
genImg2Img: 'https://www.aiease.ai/api/api/gen/img2img',
gentext2img: 'https://www.aiease.ai/api/api/gen/text2img',
taskInfo: 'https://www.aiease.ai/api/api/id_photo/task-info',
styleList: 'https://www.aiease.ai/api/api/common/ai_filter_style',
token: 'https://www.aiease.ai/api/api/user/visit',
};

const headers = {
json: {
'Content-Type': 'application/json',
'User-Agent': 'Mozilla/5.0',
'Authorization': null,
'Accept': 'application/json'
},
image: {
'Content-Type': 'image/jpeg',
'User-Agent': 'Mozilla/5.0',
'Accept': '*/*'
}
};

const default_payload = {
enhance: { gen_type: "enhance", enhance_extra_data: { img_url: null, mode: null, size: "4", restore: 1 } },
filter: { gen_type: 'ai_filter', ai_filter_extra_data: { img_url: null, style_id: null } },
watermark: { gen_type: "text_remove", text_remove_extra_data: { img_url: null, mask_url: "" } },
rembg: { gen_type: "rembg", rembg_extra_data: { img_url: null } },
retouch: { gen_type: "ai_skin_repair", ai_skin_repair_extra_data: { img_url: null } }
};

const constants = { maxRetry: 40, retryDelay: 3000 };
let AUTH_TOKEN = null;

const setupEncryption = () => {
const encryptionKeyPhrase = "Q@D24=oueV%]OBS8i,%eK=5I|7WU$PeE";
const hashHex = CryptoJS.SHA256(encryptionKeyPhrase).toString(CryptoJS.enc.Hex);
const encryptionKey = CryptoJS.enc.Hex.parse(hashHex);
return {
useEncrypt: (plainText) => {
const encodedText = encodeURIComponent(plainText);
const iv = CryptoJS.lib.WordArray.random(16);
const encrypted = CryptoJS.AES.encrypt(encodedText, encryptionKey, { iv, mode: CryptoJS.mode.CFB, padding: CryptoJS.pad.NoPadding });
return CryptoJS.enc.Base64.stringify(iv.concat(encrypted.ciphertext));
},
useDecrypt: (base64EncryptedText) => {
const encryptedBytes = CryptoJS.enc.Base64.parse(base64EncryptedText);
const iv = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(0, 4), 16);
const ciphertext = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(4), encryptedBytes.sigBytes - 16);
const decrypted = CryptoJS.AES.decrypt({ ciphertext }, encryptionKey, { iv, mode: CryptoJS.mode.CFB, padding: CryptoJS.pad.NoPadding });
return decodeURIComponent(decrypted.toString(CryptoJS.enc.Utf8));
}
};
};

const { useEncrypt, useDecrypt } = setupEncryption();

const getFileBuffer = async (input) => {
    if (Buffer.isBuffer(input)) return input;
    if (/^data:.*?\/.*?;base64,/i.test(input)) return Buffer.from(input.split(',')[1], 'base64');
    if (/^https?:\/\//.test(input)) {
        const res = await axios.get(input, { responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    }
    if (fs.existsSync(input)) return fs.readFileSync(input);
    return Buffer.alloc(0);
};

const uploadImage = async (input) => {
if (!AUTH_TOKEN) await getToken();
const fileBuffer = await getFileBuffer(input);
const metadataJsonString = JSON.stringify({ length: fileBuffer.length, filetype: 'image/jpeg', filename: 'image.jpg' });
const encryptedMetadata = useEncrypt(metadataJsonString);
const apiUrl = `${api.uploader}?time=${Date.now()}`;
const response = await axios.post(apiUrl, { t: encryptedMetadata }, { headers: headers.json });
const uploadUrl = useDecrypt(response.data.result);
await axios.put(uploadUrl, fileBuffer, { headers: { 'Content-Length': fileBuffer.length, ...headers.image } });
return uploadUrl.split('?')[0];
};

const generateImage = async (type, input, { style = 4, mode = 'general' } = {}) => {
if (!AUTH_TOKEN) await getToken();
const payload = default_payload[type];
if (!payload) throw new Error(`Invalid type: ${type}`);

const imgUrl = await uploadImage(input);
const dataKey = Object.keys(payload).find(key => key.endsWith("_extra_data"));
if (dataKey) payload[dataKey].img_url = imgUrl;

if (type === 'filter') payload[dataKey].style_id = style;
else if (type === 'enhance') payload[dataKey].mode = mode;

const response = await axios.post(api.genImg2Img, payload, { headers: headers.json });
if (response.data && response.data.result && response.data.result.task_id) {
const taskId = response.data.result.task_id;
return await checkTaskStatus(taskId);
} else {
throw new Error(response.data.message || 'Task ID not found in response');
}
};

const text2img = async (prompt, { style = 1, size = '1-1' } = {}) => {
if (!AUTH_TOKEN) await getToken();
const payload = {
gen_type: "art_v1",
art_v1_extra_data: { prompt, style_id: style, size }
};
const response = await axios.post(api.gentext2img, payload, { headers: headers.json });
if (response.data && response.data.result && response.data.result.task_id) {
const taskId = response.data.result.task_id;
return await checkTaskStatus(taskId);
} else {
throw new Error(response.data.message || 'Task ID not found in response');
}
};

const checkTaskStatus = async (taskId, maxRetry = 40, delay = 3000) => {
    let attempts = 0;
    while (attempts < maxRetry) {
        const res = await axios.get(`${api.taskInfo}?task_id=${taskId}`, { headers: headers.json });
        const data = res.data.result?.data;

        if (!data) throw new Error("Task data tidak ditemukan");

        const status = data.queue_info?.status;

        if (status === "success") {
            // Ambil hasil generate
            if (data.results && data.results.length > 0) {
                return data.results.map(r => r.origin); // bisa ganti ke thumb jika mau
            } else {
                throw new Error("Task selesai tapi hasil kosong");
            }
        }

        // status belum selesai, tunggu
        await new Promise(r => setTimeout(r, delay));
        attempts++;
    }

    throw new Error(`Max retry reached for task ${taskId}`);
};

const getStyle = async () => {
if (!AUTH_TOKEN) await getToken();
const response = await axios.get(api.styleList, { headers: headers.json });
if (response.data.code === 200) return response.data.result;
throw new Error(response.data.message || 'Failed to fetch style list');
};

const getToken = async () => {
const response = await axios.post(api.token, {}, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
if (response.data.code === 200) {
AUTH_TOKEN = `JWT ${response.data.result.user.token}`;
headers.json.Authorization = AUTH_TOKEN;
} else {
throw new Error(response.data.message || 'Failed to fetch token');
}
};

class ZombieGenerator {
  constructor() {
    this.headers = {
      accept: "*/*",
      "accept-language": "id-ID,id;q=0.9",
      origin: "https://makemeazombie.com",
      priority: "u=1, i",
      referer: "https://makemeazombie.com/",
      "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
    };
    this.host = null;
    this.hash = this.genHash();
    this.eventSource = null;
    this.modeMap = {
      1: "Classic",
      2: "In Place"
    };
  }
  genHash() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  async getHost() {
    try {
      console.log("🔍 Getting host...");
      const res = await axios.get("https://huggingface.co/api/spaces/jbrownkramer/makemeazombie/host", {
        headers: this.headers
      });
      this.host = res.data?.host;
      console.log("✅ Host:", this.host);
      return this.host;
    } catch (err) {
      console.error("❌ Host error:", err.message);
      throw new Error(`Host failed: ${err.message}`);
    }
  }
  async toBlob(img) {
    try {
      if (img.startsWith("data:")) {
        console.log("📝 Base64 to blob...");
        const data = img.split(",")[1];
        const mime = img.split(";")[0].split(":")[1];
        const buf = Buffer.from(data, "base64");
        return {
          buf: buf,
          mime: mime
        };
      } else {
        console.log("🌐 URL to blob...");
        const res = await axios.get(img, {
          responseType: "arraybuffer",
          headers: {
            "user-agent": this.headers["user-agent"]
          }
        });
        const buf = Buffer.from(res.data);
        const mime = res.headers["content-type"] || "application/octet-stream";
        return {
          buf: buf,
          mime: mime
        };
      }
    } catch (err) {
      console.error("❌ Blob error:", err.message);
      throw new Error(`Blob failed: ${err.message}`);
    }
  }
  async upload(img) {
    try {
      if (!this.host) await this.getHost();
      console.log("📤 Uploading...");
      const {
        buf,
        mime
      } = await this.toBlob(img);
      const form = new FormData();
      form.append("files", buf, {
        filename: "blob",
        contentType: mime
      });
      const res = await axios.post(`${this.host}/gradio_api/upload`, form, {
        headers: {
          ...this.headers,
          ...form.getHeaders(),
          "sec-fetch-storage-access": "none"
        }
      });
      const path = res.data?.[0];
      console.log("✅ Uploaded:", path);
      return path;
    } catch (err) {
      console.error("❌ Upload error:", err.message);
      throw new Error(`Upload failed: ${err.message}`);
    }
  }
  async join(path, mode = 1) {
    try {
      const modeName = this.modeMap[mode] || "In Place";
      console.log(`🚀 Joining queue with mode: ${modeName}...`);
      const data = {
        data: [{
          path: path,
          meta: {
            _type: "gradio.FileData"
          }
        }, modeName, "zombie"],
        event_data: null,
        fn_index: 2,
        trigger_id: null,
        session_hash: this.hash
      };
      const res = await axios.post(`${this.host}/gradio_api/queue/join?`, data, {
        headers: {
          ...this.headers,
          "content-type": "application/json",
          "sec-fetch-storage-access": "none"
        }
      });
      const id = res.data?.event_id;
      console.log("✅ Queue joined:", id);
      return id;
    } catch (err) {
      console.error("❌ Queue error:", err.message);
      throw new Error(`Queue failed: ${err.message}`);
    }
  }
  async process(id) {
    return new Promise((resolve, reject) => {
      try {
        console.log("👂 Listening...");
        this.eventSource = new EventSource(`${this.host}/gradio_api/queue/data?session_hash=${this.hash}`, {
          headers: {
            ...this.headers,
            accept: "text/event-stream",
            "content-type": "application/json",
            "sec-fetch-storage-access": "none"
          }
        });
        let started = false;
        let timeoutId = null;
        this.eventSource.onmessage = e => {
          try {
            const data = JSON.parse(e.data);
            console.log("📨 Event:", data.msg);
            switch (data.msg) {
              case "estimation":
                console.log(`⏳ Queue: ${data.rank}, ETA: ${data.rank_eta?.toFixed(1)}s`);
                break;
              case "process_starts":
                started = true;
                console.log(`🔄 Started, ETA: ${data.eta?.toFixed(1)}s`);
                break;
              case "process_completed":
                console.log("✅ Done!");
                const out = data.output?.data?.[0];
                if (out?.url) {
                  this.cleanup(timeoutId);
                  resolve({
                    success: true,
                    imageUrl: out.url,
                    path: out.path,
                    filename: out.orig_name,
                    mimeType: out.mime_type,
                    duration: data.output?.duration,
                    avgDuration: data.output?.average_duration
                  });
                } else {
                  this.cleanup(timeoutId);
                  reject(new Error("No output URL"));
                }
                break;
              case "close_stream":
                this.cleanup(timeoutId);
                if (!started) reject(new Error("Stream closed early"));
                break;
              default:
                console.log("ℹ️ Unknown:", data.msg);
            }
          } catch (parseErr) {
            console.error("❌ Parse error:", parseErr.message);
          }
        };
        this.eventSource.onerror = err => {
          console.error("❌ ES error:", err);
          this.cleanup(timeoutId);
          reject(new Error("EventSource failed"));
        };
        timeoutId = setTimeout(() => {
          if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
            this.cleanup(timeoutId);
            reject(new Error("Timeout (60s)"));
          }
        }, 6e4);
      } catch (err) {
        console.error("❌ ES setup error:", err.message);
        reject(err);
      }
    });
  }
  cleanup(timeoutId) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
  async generate({
    imageUrl,
    mode = 2
  }) {
    try {
      console.log("🧟 Starting...");
      await this.getHost();
      const path = await this.upload(imageUrl);
      const id = await this.join(path, mode);
      const result = await this.process(id);
      console.log("🎉 Done!");
      return result;
    } catch (err) {
      console.error("❌ Failed:", err.message);
      this.cleanup();
      throw err;
    }
  }
}

router.get("/api/ai/tozombie", checkApiKeys, async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.json({ status: false, message: "Please Enter url Parameters" });
    }

    try {
        const zombie = new ZombieGenerator();
        const result = await zombie.generate({ imageUrl });

        if (!result.imageUrl) {
            return res.status(500).json({
                status: 500,
                message: "Failed"
            });
        }

        // download hasil zombie ke buffer
        const imgResp = await axios.get(result.imageUrl, { responseType: "arraybuffer" });
        const tempFile = path.join(os.tmpdir(), "zombie.webp");
        fs.writeFileSync(tempFile, imgResp.data);

        // upload ke Catbox
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", fs.createReadStream(tempFile));

        const catbox = await axios.post("https://catbox.moe/user/api.php", form, {
            headers: form.getHeaders(),
        });

        // hapus file sementara
        fs.unlinkSync(tempFile);

        // kirim hasil akhir cuma link Catbox
        return res.json({
            status: 200,
            result: catbox.data.trim()
        });

    } catch (err) {
        console.error("❌ Error:", err.message);
        return res.status(500).json({
            status: 500,
            message: "An internal error occurred",
            result: "error"
        });
    }
});

router.get("/api/ai/toanime", checkApiKeys, async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.json({ status: false, message: "Please Enter url Parameters" });
    }

    try {
        const data = await generateImage("filter", url, { style: 4 });
        return res.json({
            status: 200,
            result: data
        });
    } catch (err) {
        console.error("Generate gagal:", err.message);
        return res.status(500).json({ status: 500, message: "An internal error occurred", result: "error" });
    }
});

router.get("/api/tools/bypass", checkApiKeys, async (req, res) => {
  const { sitekey, url } = req.query;
  if (!sitekey || !url) {
    return res.json({ status: false, message: "Please Enter siteKey & url Parameters" });
  }

  try {
    const solver = new CaptchaSolver();
    const response = await solver.solve(req.query);

    // Jika solve mengindikasikan error, forward sebagai 502
    if (!response.success) {
      return res.status(502).json({
        success: false,
        error: "Upstream solver error"
      });
    }

    // Balikan token yang bersih + raw untuk debugging (opsional)
    return res.json({
      status: 200,
      token: response.token
    });
  } catch (error) {
    console.error("Error in /api/tools/bypass:", error);
    return res.status(500).send({
      status: 500,
      message: "An internal error occurred",
      result: "error"
    });
  }
});


router.get("/api/ai/txt2img", checkApiKeys, async (req, res) => {
  try {
    const prompt = req.query.prompt;
    const ratio = req.query.ratio;
    if (!prompt) return res.json({ success: false, message: "Please Enter Prompt Parameters" });
    if (!ratio) return res.json({ success: false, message: "Please Enter Ratio Parameters" });

    const vertex = new VertexAI();
    const result = await vertex.image({ prompt, aspect_ratio: ratio });

    res.json({ status: 200, data: result.url });
  } catch (err) {
    res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
  }
});

router.get("/api/maker/ml", checkApiKeys, async (req, res) => {
  const {
    theme = "flag",
    flagId = "ua",
    profileUrl,
    gradient = "45deg, ff7e5f, feb47b",
    pattern = "https://www.toptal.com/designers/subtlepatterns/uploads/dark_embroidery.png",
    template = "1",
    type = "v5",
  } = req.query;

  // === cek parameter wajib ===
  if (!profileUrl) {
    return res.json({
      status: false,
      message: "Please provide 'profileUrl' parameter",
    });
  }

  try {
    const url = await htmlToImg.generate({ theme, flagId, profileUrl, gradient, pattern, template, type });
    const buffer = await htmlToImg.getImageBuffer(url);

    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
  }
});

router.get("/api/maker/brat", checkApiKeys, async (req, res) => {
  const { text = "Brat", size = "100", blur = "5" } = req.query;

  if (!text) {
    return res.json({
      status: false,
      message: "Please enter 'text & size & blur' parameter"
    });
  }

  const brat = new BratGenerator();

  try {
    const buffer = await brat.create(text, size, blur);
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
  }
});

// GET router
router.get("/api/solve", checkApiKeys, async (req, res) => {
  try {
    const result = await runGet({ req, solveBypass });
    res.status(result.code || 200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Internal Server Error" });
  }
});

router.post("/api/tools/videy", checkApiKeys, uploader.single("file"), async (req, res) => {
  try {
    let buffer;

    if (req.file) {
      // File upload dari user
      buffer = req.file.buffer;
    } else if (req.body.url) {
      // File dari URL
      const response = await fetch(req.body.url);
      if (!response.ok) return res.json({ status: false, error: "Failed to fetch URL" });
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      return res.json({ status: false, error: "File or URL must be provided" });
    }

    // Upload ke Videy
    const url = await videy(buffer);

    res.json({ status: 200, result: url });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
  }
});

router.get('/api/ai/gpt4o', checkApiKeys, async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.json({ status: false, message: "Please Enter Message Parameters" });
  }

  // Filter kata-kata terlarang
  const forbidden = [
    "18+", "porn", "sex", "shapesinc", "kntl", "ktl", "kontol", 
    "anj", "ajg", "anjing", "babi", "bbi", "asw", "asu", "45u", 
    "ngen", "ngent", "ngentot", "tot", "biadab", "biadap", 
    "talk.shapes.inc", "https://talk.shapes.inc", 
    "monyet", "nyet", "onyet"
  ];
  const lowerMessage = message.toLowerCase();
  if (forbidden.some(word => lowerMessage.includes(word))) {
    return res.status(400).json({ 
      status: false, 
      message: "Content not allowed" 
    });
  }

  try {
    const client = new ChatGPTClientsi();
    const response = await client.chat({
      prompt: message,
      model: "gpt-4o-2024-08-06"
    });

    let result = response.result;

    // Hapus prefix "openaigpt5: "
    if (result && result.startsWith("openaigpt5: ")) {
      result = result.replace(/^openaigpt5:\s*/, '');
    }

    res.status(200).json({ status: 200, result });
  } catch (err) {
    console.error("❌ API error:", err);
    res.status(500).json({ 
      status: 500, 
      message: 'An internal error occurred', 
      result: 'error' 
    });
  }
});

router.get('/api/ai/gpt-5-nano', checkApiKeys, async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.json({ status: false, message: "Please Enter Message Parameters" });
  }

  // Filter kata-kata terlarang
  const forbidden = [
    "18+", "porn", "sex", "shapesinc", "kntl", "ktl", "kontol", 
    "anj", "ajg", "anjing", "babi", "bbi", "asw", "asu", "45u", 
    "ngen", "ngent", "ngentot", "tot", "biadab", "biadap", 
    "talk.shapes.inc", "https://talk.shapes.inc", 
    "monyet", "nyet", "onyet"
  ];
  const lowerMessage = message.toLowerCase();
  if (forbidden.some(word => lowerMessage.includes(word))) {
    return res.status(400).json({ 
      status: false, 
      message: "Content not allowed" 
    });
  }

  try {
    const client = new ChatGPTClientsy();
    const response = await client.chat({
      prompt: message,
      model: "gpt-5-nano"
    });

    let result = response.result;

    // Hapus prefix "openaigpt5: "
    if (result && result.startsWith("openaigpt5: ")) {
      result = result.replace(/^openaigpt5:\s*/, '');
    }

    res.status(200).json({ status: 200, result });
  } catch (err) {
    console.error("❌ API error:", err);
    res.status(500).json({ 
      status: 500, 
      message: 'An internal error occurred', 
      result: 'error' 
    });
  }
});

// Route GET
router.get('/api/ai/gpt5', checkApiKeys, async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.json({ status: false, message: "Please Enter Message Parameters" });
  }

  // Filter kata-kata terlarang
  const forbidden = [
    "18+", "porn", "sex", "shapesinc", "kntl", "ktl", "kontol", 
    "anj", "ajg", "anjing", "babi", "bbi", "asw", "asu", "45u", 
    "ngen", "ngent", "ngentot", "tot", "biadab", "biadap", 
    "talk.shapes.inc", "https://talk.shapes.inc", 
    "monyet", "nyet", "onyet"
  ];
  const lowerMessage = message.toLowerCase();
  if (forbidden.some(word => lowerMessage.includes(word))) {
    return res.status(400).json({ 
      status: false, 
      message: "Content not allowed" 
    });
  }

  try {
    const client = new ChatGPTClient();
    const response = await client.chat({
      prompt: message,
      model: "gpt-5"
    });

    let result = response.result;

    // Hapus prefix "openaigpt5: "
    if (result && result.startsWith("openaigpt5: ")) {
      result = result.replace(/^openaigpt5:\s*/, '');
    }

    res.status(200).json({ status: 200, result });
  } catch (err) {
    console.error("❌ API error:", err);
    res.status(500).json({ 
      status: 500, 
      message: 'An internal error occurred', 
      result: 'error' 
    });
  }
});

router.get('/api/ai/gpt-5-mini', checkApiKeys, async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.json({ status: false, message: "Please Enter Message Parameters" });
  }

  // Filter kata-kata terlarang
  const forbidden = [
    "18+", "porn", "sex", "shapesinc", "kntl", "ktl", "kontol", 
    "anj", "ajg", "anjing", "babi", "bbi", "asw", "asu", "45u", 
    "ngen", "ngent", "ngentot", "tot", "biadab", "biadap", 
    "talk.shapes.inc", "https://talk.shapes.inc", 
    "monyet", "nyet", "onyet"
  ];
  const lowerMessage = message.toLowerCase();
  if (forbidden.some(word => lowerMessage.includes(word))) {
    return res.status(400).json({ 
      status: false, 
      message: "Content not allowed" 
    });
  }

  try {
    const client = new ChatGPTClients();
    const response = await client.chat({
      prompt: message,
      model: "gpt-5-mini"
    });

    let result = response.result;

    // Hapus prefix "openaigpt5: "
    if (result && result.startsWith("openaigpt5: ")) {
      result = result.replace(/^openaigpt5:\s*/, '');
    }

    res.status(200).json({ status: 200, result });
  } catch (err) {
    console.error("❌ API error:", err);
    res.status(500).json({ 
      status: 500, 
      message: 'An internal error occurred', 
      result: 'error' 
    });
  }
});

router.get('/api/ai/gemini', checkApiKeys, async (req, res, next) => {
     var message = req.query.message;
     if (!message) return res.json({ status: false, message: "Please Enter Message Parameters" })
     
     try {
     const gemini = new Gemini();
     let result = await gemini.chat(message)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

// GET /api/imagen?prompt=...&type=...&negative=...&size=...
router.get("/api/ai/imagen", checkApiKeys, async (req, res) => {
  try {
    const { prompt, type = "realistic", negative = "", size = "1:1" } = req.query;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        code: 400,
        result: { error: "Please Enter Prompt & Type & Size Parameters" },
      });
    }

    const result = await imagen.generate(prompt, type, negative, size);

    if (!result.success) {
      return res.status(result.code || 500).json(result);
    }

    // opsional: kalau mau langsung return gambar base64
    const { data } = await axios.get(result.result.url, {
      responseType: "arraybuffer",
    });
    const base64Image = Buffer.from(data, "binary").toString("base64");

    res.json({
      ...result,
      imageBase64: `data:image/jpeg;base64,${base64Image}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: 500,
      result: { error: "An internal error occurred" },
    });
  }
});

router.get('/api/ai/img2img', checkApiKeys, async (req, res, next) => {
  var prompt = req.query.prompt;
  var imageURL = req.query.imageURL;
  if (!prompt) return res.json({ status: false, message: "Please Enter Prompt Parameters" })
  if (!imageURL) return tes.json({ status: false, message: "Please Enter imageURL Parameters" })

  try {
    const ai = new AIGenerator();
    let result = await ai.generate({ prompt, imageUrl: imageURL });
    res.status(200).json({ status: 200, url: result });
  } catch (err) {
    console.log(err);
    res.status(500).send({
      status: 500,
      message: "An internal error occurred",
      result: "error",
    });
  }
});

router.get('/api/search/resep', checkApiKeys, async (req, res, next) => {
     var url = req.query.url;
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await scrapeRecipe(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/instagram', async (req, res, next) => {
     var url = req.query.url;
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await snapinsDownload(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/search/bacaresep', checkApiKeys, async (req, res, next) => {
     var query = req.query.query;
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await scrapeRecipeData(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/tools/whatsapp', checkApiKeys, async (req, res, next) => {
     var no = req.query.no;
     if (!no) return res.json({ status: false, message: "Please Enter No Parameters" })
     
     try {
     let result = await getData(no)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/search/steam', checkApiKeys, async (req, res, next) => {
     var query = req.query.query;
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await steam(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/facebook', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await downloadfbvid(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/terabox', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await teraboxdl(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/search/steamdetail', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await detail(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/download/instahigh', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter URL Parameters" })
     
     try {
     let result = await instaghigh(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/download/wkkwwkbssh', checkApiKeys, async (req, res, next) => {
  var url = req.query.url
  if (!url) return res.json({ status: false, message: "[!] masukan parameter url" })
  imgToAnime(url)
    .then((data) => {
      var image = data.image;
      var requestSettings = {
        url: image,
        method: 'GET',
        encoding: null
      }
      request(requestSettings, function(error, response, body) {
        res.set('Content-Type', 'image/png');
        res.send(body);
      })
    })
    .catch((error) => {
      res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
    })
})

// fiture download

router.get('/api/download/twitter', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await x2twitter(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/threads', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     const threads = new Downloader();
     let result = await threads.download(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get("/api/download/youtubemp3", checkApiKeys, async (req, res) => {
  const url = req.query.url;
  const kualitas = req.query.kualitas || "128"; // default audio 128kbps
  const type = "audio"; // tetap audio

  if (!url) return res.status(400).json({ status: false, message: "Please provide URL parameter." });

  try {
    const yt = new Youtubers();
    const result = await yt.downloadyt(url, kualitas, type);

    if (result.status) {
      res.status(200).json({ status: 200, result });
    } else {
      res.status(400).json({ status: 400, message: result.pesan });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, message: "Internal server error", error: err.message });
  }
});

router.get('/api/download/youtube', checkApiKeys, async (req, res) => {
  const url = req.query.url;
  const format = req.query.format || "360p";
  if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" });

  try {
    const yt = new YT();
    let result = await yt.download({ url, format });

    // Jika result masih berupa string JSON, parse dulu
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch (err) {
        console.warn("Failed to parse download result JSON, returning raw string");
      }
    }

    res.status(200).json({ status: 200, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, message: 'An internal error occurred', result: 'error' });
  }
});
       
router.get('/api/download/ytsearch', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await youtubeSearch(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/shortsyt', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await shorts(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/billpln', checkApiKeys, async (req, res, next) => {
     var no = req.query.no;
     if (!no) return res.json({ status: false, message: "Please Enter No Parameters" })
     
     try {
     let result = await fetchNopel(no)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       

router.get('/api/search/genshin', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await genshin(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/trendyt', checkApiKeys, async (req, res, next) => {
     try {
     let result = await trendingyt();
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

// Route API TikTok Playground
router.get('/api/download/tiktok', checkApiKeys, async (req, res) => {
    var url = req.query.url

    if (!url) {
        return res.status(400).json({ error: 'Please Enter Url Parameters' });
    }

    try {
       const tikVid = new TikVid();
        let result = await tikVid.download(url)
        res.status(200).json({ status: 200, result: result })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An internal error occurred' });
    }
});

router.get('/api/download/kraken', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await krakenFiles(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/tools/ppfb', checkApiKeys, async (req, res, next) => {
     var url = req.query.url;
     if (!url) return res.json({ status: false, message: "Please Enter URL Parameters" })
     
     try {
     let result = await fotofb(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/tools/pptiktok', checkApiKeys, async (req, res, next) => {
     var username = req.query.username;
     if (!username) return res.json({ status: false, message: "Please Enter Username Parameters" })
     
     try {
     let result = await getTikTokProfileInfo(username)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/stalk/tiktok', checkApiKeys, async (req, res, next) => {
     var username = req.query.username;
     if (!username) return res.json({ status: false, message: "Please Enter Username Parameters" })
     
     try {
     let result = await ttstalk(username)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/stalk/ytuser', checkApiKeys, async (req, res, next) => {
     var username = req.query.username;
     if (!username) return res.json({ status: false, message: "Please Enter Username Parameters" })
     
     try {
     let result = await ytuser(username)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/stalk/instagram', checkApiKeys, async (req, res, next) => {
     var username = req.query.username;
     if (!username) return res.json({ status: false, message: "Please Enter Username Parameters" })
     
     try {
     let result = await getInstagramProfile(username)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/tools/roboguru', checkApiKeys, async (req, res, next) => {
     var query = req.query.query;
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let result = await roboguru(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/stalk/pinterest', checkApiKeys, async (req, res, next) => {
     var user = req.query.user;
     if (!user) return res.json({ status: false, message: "Please Enter User Parameters" })
     
     try {
     let result = await pinstalk(user)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/tools/agedetection', cekVip, checkApiKeys, async (req, res) => {
    try {
    var url = req.query.url

    if (!url) {
      return res.status(400).json({ error: 'URL gambar tidak ditemukan' });
    }

    const formData = new FormData();
    formData.append('api_key', APIKEY);
    formData.append('api_secret', API_SECRET);
    formData.append('image_url', url);
    formData.append('return_attributes', 'age,gender');

    const response = await axios.post('https://api-us.faceplusplus.com/facepp/v3/detect', formData, {
      headers: formData.getHeaders(),
    });

    const face = response.data.faces[0];
    if (!face) {
      return res.status(404).json({ error: 'Wajah tidak ditemukan' });
    }

    const age = face.attributes.age.value;
    const gender = face.attributes.gender.value;
    res.json({ status: 200, result: { age, gender }, });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
});
       
router.get('/api/stalk/ipaddress', checkApiKeys, async (req, res, next) => {
     var ip = req.query.ip;
     if (!ip) return res.json({ status: false, message: "Please Enter Ip Address" })
     
     try {
     let result = await getIPInfo(ip)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
//https://listrik.okcek.com/dd.php?nopel=172720204487

router.get("/random/sfw/:action", checkApiKeys, async (req, res) => {
	const value = req.params.action
	if (!value) return res.json(resValid("Invalid action, silahkan cek lagi"))
	
	try {
		const data = await Func.fetchJson(`https://raw.githubusercontent.com/ArifzynXD/database/master/anime/${value}.json`)
		const url = Func.pickRandom(data)
		const bufferr = await Func.getBuffer(url)
		res.set('Content-Type', "image/jpeg");
		res.send(bufferr);
	} catch (e) {
      console.error(e);
      res.json(config.msg.error);
    }
})

router.get("/random/asupan/:action", checkApiKeys, async (req, res) => {
	const value = req.params.action 
	if (!value) return res.json(resValid("Invalid action, silahkan cek lagi"))
	
	try {
		const data = await Func.fetchJson(`https://raw.githubusercontent.com/ArifzynXD/database/master/asupan/${value}.json`)
		const url = Func.pickRandom(data)
		res.json(resSukses(url));
	} catch (e) {
      console.error(e);
      res.json(config.msg.error);
    }
})

router.get("/random/cecan/:action", checkApiKeys, async (req, res) => {
	const value = req.params.action 
	if (!value) return res.json(resValid("Invalid action, silahkan cek lagi"))
	
	try {
		const data = await Func.fetchJson(`https://raw.githubusercontent.com/ArifzynXD/database/master/cecan/${value}.json`)
		const url = Func.pickRandom(data)
		res.json(resSukses(url));
	} catch (e) {
      console.error(e);
      res.json(config.msg.error);
    }
})



/////////////////// ROUTER TERBARU //////////////

// DOWNLOAD
router.get('/api/tools/ocr', cekPrem, checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     const ocr = new OCRService();
     let result = await ocr.ocr(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/allinone', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await allinone(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/pinterest', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await fetchPinterestVideoUrl(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/capcut', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await capcutdl(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/spotify', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     const downloader = new SpotdlDownloader();
     let result = await downloader.download({ url })
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/download/smule', checkApiKeys, async (req, res, next) => {
     var url = req.query.url
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await smuleDownload(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
router.get('/api/download/kwai', checkApiKeys, async (req, res, next) => {
     var url = req.query.url;
     if (!url) return res.json({ status: false, message: "Please Enter Url Parameters" })
     
     try {
     let result = await scrapeKwai(url)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
// SEARCH
router.get('/api/search/manga', checkApiKeys, async (req, res, next) => {
     var query = req.query.query;
     if (!query) return res.json({ status: false, message: "Please Enter query parameters" })
     
     try {
     let result = await Mangaku(query)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/vehicle', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await vehicle(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get('/api/search/olx', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await olx(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/bukalapak', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await Bukalapak(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/shopee', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await shopee(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/tokopedia', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await tokopedia(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/search/amazon', checkApiKeys, async (req, res, next) => {
     var query = req.query.query
     if (!query) return res.json({ status: false, message: "Please Enter Query Parameters" })
     
     try {
     let search = await amazon(query);
              res.status(200).json({ status: 200, result: search })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
// STALK
router.get('/api/stalk/soundcloud', checkApiKeys, async (req, res, next) => {
     var username = req.query.username;
     if (!username) return res.json({ status: false, message: "Please Enter Username Parameters" })
     
     try {
     let result = await scuser(username)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });
       
router.get('/api/ai/cai', checkApiKeys, async (req, res, next) => {
     var user = req.query.user;
     if (!user) return res.json({ status: false, message: "Please Enter User Parameters" })
     
     var charid = req.query.charid;
     if (!charid) return res.json({ status: false, message: "Please Enter CharId Parameters" })
     
     var message = req.query.message;
     if (!message) return res.json({ status: false, message: "Please Enter Message Parameters" })
     
     try {
     let result = await char(user, charid, message)
              res.status(200).json({ status: 200, result: result })
          } catch(err) {
              console.log(err)
              res.status(500).send({ status: 500, message: 'An internal error occurred', result: 'error' })
         }
       });

router.get("/api/maker/iqc", async (req, res) => {
  const { text, chatTime, statusBarTime } = req.query;

  if (!text || !chatTime || !statusBarTime) {
    return res.json({
      status: false,
      message: "Parameter text, chatTime, dan statusBarTime wajib diisi!",
    });
  }

  try {
    const quoteOptions = {
      text,
      chatTime,
      statusBarTime,
    };

    const quoteBuffer = await generateFakeChatIphone(quoteOptions);

    if (!quoteBuffer) {
      return res.status(500).json({
        status: false,
        message: "Gagal membuat fake chat",
      });
    }

    res.set("Content-Type", "image/png");
    res.send(quoteBuffer); // langsung kirim gambar
  } catch (err) {
    console.error("Error membuat fake chat:", err);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
