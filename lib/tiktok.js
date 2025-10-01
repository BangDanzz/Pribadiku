const axios = require('axios');
const cheerio = require('cheerio');// npm install cheerio
const qs = require('qs');

class tiktok {
	constructor(){
		//super();
	}
    
    tiktokdownload(url) {
        return new Promise((resolve, reject) => {
            axios.get('https://ssstik.io/en')
                .then(response => {
                const $$ = cheerio.load(response.data);
                const html = $$('body').html();
                const regexUrl = /hx-post="([^"]+)"/g;
                const matchUrl = html.match(regexUrl);
                var _ej, _gc;
                if (matchUrl) {
                    const url = matchUrl[0].replace('hx-post="', '').replace('"', '');
                    //console.log(url); // /abc?url=dl
                    _ej = url;
                }
                const regexVals = /tt:'([^']+)'/g;
                let matchVals;
                while ((matchVals = regexVals.exec(html)) !== null) {
                    //console.log(matchVals[1]); // bnFyYXI2
                    _gc = matchVals[1];
                }
                const dataPost = {
                    id: url,
                    locale: 'id',
                    tt: _gc || 0
                }
                //console.log(dataPost);
                // return console.log(cookie);
                axios({
                    method: 'POST',
                    url: `https://ssstik.io${_ej}`,
                    headers: {
                        accept: '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'hx-current-url': 'https://ssstik.io/id',
                        'hx-request': 'true',
                        'hx-target': 'target',
                        'hx-trigger': ' _gcaptcha_pt',
                        origin: 'https://ssstik.io',
                        referer: 'https://ssstik.io/id',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537'
                    },
                    data: qs.stringify(dataPost)
                }).then(({ data }) => {
                    //console.log(data)
                    const $ = cheerio.load(data);
                    const result = {
                        nowm: $('#mainpicture > div > div > a.pure-button.pure-button-primary.is-center.u-bl.dl-button.download_link.without_watermark.vignette_active')?.attr('href'),
                        wm: {
                            comment: $('#mainpicture > div > div > div > div.d-flex.flex-1.align-items-center.justify-content-center > div').text(),
                            share: $('#mainpicture > div > div > div > div.d-flex.flex-1.align-items-center.justify-content-end > div').text(),
                            like: $('#mainpicture > div > div > div > div.d-flex.flex-1.align-items-center.justify-content-start > div:nth-child(2)').text()
                        },
                        audio: $('#mainpicture > div > div > a.pure-button.pure-button-primary.is-center.u-bl.dl-button.download_link.music.vignette_active').attr('href')
                    }
                    //console.log(result);
                    resolve(result);
                }).catch(e => {
                    reject({ status: false, message: 'error fetch data', e: e.message })
                })
                //
            }).catch(e => {
                reject({ status: false, message: 'error fetch data', e: e.message })
            });
        })
    }
}

const Tiktok = new tiktok();
module.exports = Tiktok;