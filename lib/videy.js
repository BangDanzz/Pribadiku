const chalk = require("chalk");
const { fromBuffer } = require("file-type");
const FormData = require("form-data");
const fetch = require("node-fetch");
const fakeUa = require("fake-useragent");
const nanoid = require("nanoid");

async function videy(content) {
  try {
    const ft = await fromBuffer(content);
    const ext = ft?.ext || "bin";
    const mime = ft?.mime || "application/octet-stream";

    const form = new FormData();
    form.append("file", content, { filename: `${nanoid()}.${ext}`, contentType: mime });

    const response = await fetch("https://videy.co/api/upload", {
      method: "POST",
      body: form,
      headers: {
        "User-Agent": fakeUa(),
        ...form.getHeaders(),
      },
    });

    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      const match = text.match(/https?:\/\/cdn\.videy\.co\/\w+\.mp4/);
      if (!match) throw new Error("Cannot extract video URL from response");
      data = { id: match[0].split("/").pop().replace(".mp4", "") };
    }

    return `https://cdn.videy.co/${data.id}.mp4`;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = videy;