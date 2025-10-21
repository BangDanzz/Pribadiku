const request = require('request');
const fs = require('fs');
const path = require('path');
const { encode } = require('node-base64-image');

var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

const isBase64 = (str) => {
    return str.length % 4 == 0 && /^[A-Za-z0-9+/]+[=]{0,3}$/.test(str);
}

const convertTo64 = (_url) => {
    return new Promise(async (resolve, reject) => {
        if (_url.indexOf(';base64,') !== -1 || isBase64(_url)){
            resolve(_url);
        }else {
            let options;
            if (_url.indexOf('http') !== -1){
                options  = {string: true}
            }else {
                options  = {string: true, local: true}
            }
            const image = encode(_url, options);
            resolve(image);
        }
    });
}

const randomUUI = (a, b) => {
    for (b = a = ''; a++ < 36; b += a * 51 & 52 ? (a ^ 15 ? 8 ^ Math.random() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '');
    return b;
};

class makemeazombie {
    constructor() {}
    
    transform(args) {
        return new Promise((resolve, reject) => {
            if (typeof args.photo !== 'undefined' && args.photo !== '') {
                convertTo64(args.photo)
                    .then(async (res) => {
                        let nameFile = `${randomUUI()}.jpeg`;
                        let pathImage = path.join(__dirname, `./tmp/${nameFile}`);
                        let base64Image = res.split(';base64,').pop();
                        fs.writeFileSync(pathImage, base64Image, { encoding: 'base64' }, (err) => {
                            if (err) console.error('File created with error');
                        });

                        request.post({
                            url: 'https://deepgrave-image-processor-no7pxf7mmq-uc.a.run.app/transform_in_place',
                            contentType: false,
                            formData: {
                                image: fs.createReadStream(pathImage)
                            }
                        }, async (error, response, body) => {
                        
                            fs.unlinkSync(pathImage);

                            if (error) {
                                reject('An error occurred while trying to transform the image');
                            } else {
                                if (body === 'No face found') {
                                    reject('It was not possible to identify a face in the image, try sending a profile image');
                                } else {
                                    let imgBuffer = Buffer.from(body, 'base64');

                                    if (args.destinyFolder !== undefined && args.destinyFolder !== '') {
                                        if (fs.existsSync(args.destinyFolder)) {
                                            const finalImage = path.join(args.destinyFolder, nameFile);
                                            fs.writeFileSync(finalImage, imgBuffer, (err) => {
                                                if (err) {
                                                    reject('Error saving the transformed image');
                                                } else {
                                                    resolve(finalImage);
                                                }
                                            });
                                        } else {
                                            reject('Destiny Directory not found.');
                                        }
                                    } else {
                                        resolve(imgBuffer.toString('base64'));
                                    }
                                }
                            }
                        });
                    })
                    .catch(err => {
                        reject(err);
                    });
            } else {
                reject('An image must be provided to transform...');
            }
        });
    }
}

module.exports = makemeazombie;
