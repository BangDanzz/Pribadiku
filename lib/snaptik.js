const { request, fetch } = require('undici');
const querystring = require("querystring");
const { Buffer } = require('buffer');

const apiUrl = 'https://snapdouyin.app/wp-json/aio-dl/video-data/'

const headers = {
	"content-type": "application/x-www-form-urlencoded",
}

async function downloadTiktok(url) {
	try {
		const options = querystring.stringify({ url });

		const response = await request(apiUrl, { method: "POST", body: options, headers })

		return await response.body.json()
	} catch (error) {
		throw new Error(`An error occurred: ${error.message}`);
	}
}

async function getBufferFromURL(url) {
	try {
		const response = await fetch(url);

		const buffer = Buffer.from(await response.arrayBuffer());

		return buffer;
	} catch (error) {
		throw new Error(`An error occurred: ${error.message}`);
	}
}

function getBestMediaWithinLimit(medias, limitedSizeBytes) {
	return medias.filter(media => media.size <= limitedSizeBytes)
		.sort((a, b) => b.size - a.size)[0] || null
}

function filterNoWatermark(medias) {
	return medias.filter(media => media.quality !== 'watermark')
}

function filterVideo(medias) {
	return medias.filter(media => media.videoAvailable && media.audioAvailable)
}

function filterAudio(medias) {
	return medias.filter(media => !media.videoAvailable && media.audioAvailable)
}

module.exports = { downloadTiktok, getBufferFromURL, getBestMediaWithinLimit, filterNoWatermark, filterVideo, filterAudio }