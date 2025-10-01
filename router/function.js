const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');

module.exports = class Function {
  constructor() {
    this.axios = axios;
    this.cheerio = cheerio;
    this.fetch = fetch;
  }

  deleteFile = (FilePath) => {
    setTimeout(
      () => {
        if (fs.existsSync(FilePath)) {
          fs.unlinkSync(FilePath);
          console.log(`File ${FilePath} dihapus.`);
        }
      },
      5 * 60 * 1000
    );
  };

  temp = (filename) => {
    const storagePath = path.join(__dirname, '../../storage', 'temp', filename);
    return storagePath;
  };

  saveImage = async ({ url, buffer, filename }) => {
    try {
      const storagePath = path.join(__dirname, '../../storage', 'temp');

      // Ensure the storage directory exists
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      // Determine the full path for the image
      const imagePath = path.join(storagePath, filename);

      if (url) {
        // If URL is provided, download the image
        const imageResponse = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(imagePath);
        imageResponse.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(imagePath));
          writer.on('error', (error) => reject(error));
        });
      } else if (buffer) {
        // If buffer is provided, save the image directly
        fs.writeFileSync(imagePath, buffer, 'base64');
        return imagePath;
      } else {
        throw new Error('Either url or buffer must be provided');
      }
    } catch (error) {
      throw new Error(`Failed to save image: ${error.message}`);
    }
  };

  saveFile = async (req, { url, buffer, filename }) => {
    try {
      const storagePath = path.join(__dirname, '../../storage', 'temp');

      // Pastikan direktori penyimpanan ada
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      // Tentukan path lengkap untuk file yang akan disimpan
      const filePath = path.join(storagePath, filename);
      const fullUrl = `${req.protocol}://${req.get('host')}/file/${encodeURIComponent(filename)}`;

      if (url) {
        // Jika URL diberikan, download file
        const fileResponse = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);
        fileResponse.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(fullUrl));
          writer.on('error', (error) => reject(error));
        });
      } else if (buffer) {
        // Jika buffer diberikan, simpan file langsung dari buffer
        fs.writeFileSync(filePath, buffer);
        return fullUrl;
      } else {
        throw new Error('Either url or buffer must be provided');
      }
    } catch (error) {
      throw new Error(`Failed to save file: ${error.message}`);
    }
  };

  toPDF = (images, opt = {}) => {
    return new Promise(async (resolve, reject) => {
      if (!Array.isArray(images)) images = [images];
      let buffs = [],
        doc = new PDFDocument({ margin: 0, size: 'A4' });
      for (let x = 0; x < images.length; x++) {
        if (/.webp|.gif/.test(images[x])) continue;
        let data = (
          await axios.get(images[x], { responseType: 'arraybuffer', ...opt })
        ).data;
        doc.image(data, 0, 0, {
          fit: [595.28, 841.89],
          align: 'center',
          valign: 'center',
        });
        if (images.length != x + 1) doc.addPage();
      }
      doc.on('data', (chunk) => buffs.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffs)));
      doc.on('error', (err) => reject(err));
      doc.end();
    });
  };

  isUrl = (url) => {
    try {
      if (typeof url !== 'string') throw new Error('url is a string!');
      return url.match(
        new RegExp(
          /https?:\/\/(www\.)?[-a-zA-Z0-9@:%.+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%+.~#?&/=]*)/,
          'gi'
        )
      );
    } catch (err) {
      console.log(util.format(err));
    }
  };

  pickRandom(list) {
    return list[Math.floor(list.length * Math.random())];
  }

  getBuffer = async (url, options) => {
    try {
      options ? options : {};
      const res = await axios({
        method: 'get',
        url,
        headers: {
          DNT: 1,
          'Upgrade-Insecure-Request': 1,
        },
        ...options,
        responseType: 'arraybuffer',
      });
      return res.data;
    } catch (err) {
      return err;
    }
  };

  async fetchJson(url, options = {}) {
    try {
      let data = await axios.get(url, {
        headers: {
          ...(!!options.headers ? options.headers : {}),
        },
        responseType: 'json',
        ...options,
      });

      return await data?.data;
    } catch (e) {
      throw e;
    }
  }

  toPDF = (images, opt = {}) => {
    return new Promise(async (resolve, reject) => {
      if (!Array.isArray(images)) images = [images];
      let buffs = [],
        doc = new PDFDocument({ margin: 0, size: 'A4' });
      for (let x = 0; x < images.length; x++) {
        if (/.webp|.gif/.test(images[x])) continue;
        let data = (
          await axios.get(images[x], { responseType: 'arraybuffer', ...opt })
        ).data;
        doc.image(data, 0, 0, {
          fit: [595.28, 841.89],
          align: 'center',
          valign: 'center',
        });
        if (images.length != x + 1) doc.addPage();
      }
      doc.on('data', (chunk) => buffs.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffs)));
      doc.on('error', (err) => reject(err));
      doc.end();
    });
  };

  upload = async (buffer) => {
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: Date.now() + '.jpg',
    });

    const response = await axios.post(
      'https://hostfile.my.id/api/upload',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      }
    );
    return response.data;
  };

  sendTelegram = async (chatId = config.options.chatId, data, options = {}) => {
    try {
      let token = config.options.token;

      function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
      }

      const DEFAULT_EXTENSIONS = {
        audio: 'mp3',
        photo: 'jpg',
        sticker: 'webp',
        video: 'mp4',
        animation: 'mp4',
        video_note: 'mp4',
        voice: 'ogg',
      };

      let type = options?.type
        ? options.type
        : typeof data === 'string'
          ? 'text'
          : /webp/.test((await fileType.fromBuffer(data))?.mime)
            ? 'sticker'
            : /image/.test((await fileType.fromBuffer(data))?.mime)
              ? 'photo'
              : /video/.test((await fileType.fromBuffer(data))?.mime)
                ? 'video'
                : /opus/.test((await fileType.fromBuffer(data))?.mime)
                  ? 'voice'
                  : /audio/.test((await fileType.fromBuffer(data))?.mime)
                    ? 'audio'
                    : 'document';

      let url = `https://api.telegram.org/bot${token}/send${type === 'text' ? 'Message' : capitalizeFirstLetter(type)}`;

      let form = new FormData();

      form.append('chat_id', chatId);
      if (type === 'text') form.append(type, data);
      else {
        let fileType = await fileType.fromBuffer(data);
        form.append(
          type,
          data,
          `file-${Date.now()}.${DEFAULT_EXTENSIONS?.[type] || fileType?.ext}`
        );
        if (options?.caption) form.append('caption', options.caption);
      }

      let { data: response } = await axios.post(url, form, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response;
    } catch (e) {
      throw e;
    }
  };

  async sendWhatsAppVerification(number, code) {
    const url = 'http://localhost:8080/api/v1/sendMessage'; // Ganti dengan URL endpoint API Anda jika diperlukan

    const payload = {
      to: number, // Format nomor tujuan
      type: 'interactive',
      content: {
        text: `Berikut Adalah Code Verifikasi Anda:\n\n*Code :* ${code}`, // Pesan utama
        footer: 'Copyright © 2024 ArifzynAPI', // Footer teks
        image: null, // Jika tidak ada gambar, atur ke null
        templateButtons: [
          {
            copyButton: {
              displayText: 'Copy Code', // Teks pada tombol
              id: `copyId_${code}`, // ID tombol
              code: code, // Kode verifikasi yang akan disalin
            },
          },
        ],
      },
    };

    try {
      await axios.post(url, payload);
      console.log(`Verification code sent to ${number}`);
    } catch (error) {
      console.error('Error sending verification code:', error.message);
    }
  }
};
