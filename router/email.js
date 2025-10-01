const nodemailer = require('nodemailer');

var smtpTransport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'notreply263@gmail.com',
    pass: 'edxoqbtzvcyatunz'
  },
  tls: {
        rejectUnauthorized:true
    },
});

module.exports.sendResetEmail = async (email, token) => {
  return new Promise(async (resolve, rejecet) => {
    var url = `https://api.hitori.pw/reset-password/` + token;

    await smtpTransport.sendMail(
      {
        from: 'hitori@hitori.pw',
        to: email,
        subject: 'MERESET PASSWORD ANDA',
        html: `
    <!DOCTYPE html>
    <html>
    <head>
    
      <meta charset="utf-8">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style type="text/css">
      @media screen {
        @font-face {
          font-family: 'Source Sans Pro';
          font-style: normal;
          font-weight: 400;
          src: local('Source Sans Pro Regular'), local('SourceSansPro-Regular'), url(https://fonts.gstatic.com/s/sourcesanspro/v10/ODelI1aHBYDBqgeIAH2zlBM0YzuT7MdOe03otPbuUS0.woff) format('woff');
        }
        @font-face {
          font-family: 'Source Sans Pro';
          font-style: normal;
          font-weight: 700;
          src: local('Source Sans Pro Bold'), local('SourceSansPro-Bold'), url(https://fonts.gstatic.com/s/sourcesanspro/v10/toadOcfmlt9b38dHJxOBGFkQc6VGVFSmCnC_l7QZG60.woff) format('woff');
        }
      }

      body,
      table,
      td,
      a {
        -ms-text-size-adjust: 100%; /* 1 */
        -webkit-text-size-adjust: 100%; /* 2 */
      }

      table,
      td {
        mso-table-rspace: 0pt;
        mso-table-lspace: 0pt;
      }

      img {
        -ms-interpolation-mode: bicubic;
      }

      a[x-apple-data-detectors] {
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        color: inherit !important;
        text-decoration: none !important;
      }

      div[style*="margin: 16px 0;"] {
        margin: 0 !important;
      }
      body {
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      table {
        border-collapse: collapse !important;
      }
      a {
        color: #1a82e2;
      }
      img {
        height: auto;
        line-height: 100%;
        text-decoration: none;
        border: 0;
        outline: none;
      }
      </style>
    
    </head>
    <body style="background-color: #e9ecef;">
    
      <div class="preheader" style="display: none; max-width: 0; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
        A preheader is the short summary text that follows the subject line when an email is viewed in the inbox.
      </div>

      <table border="0" cellpadding="0" cellspacing="0" width="100%">
    
        <tr>
          <td align="center" bgcolor="#e9ecef">

            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
              <tr>
                <td align="center" valign="top" style="padding: 36px 24px;">
                  <a href="https://localhost:3000" target="_blank" style="display: inline-block;">
                    <img src="https://telegra.ph/file/65f0d88d76c3d3542c88f.jpg" alt="Logo" border="0" width="100" style="display: block; width: 100px; max-width: 100px; min-width: 100px;">
                  </a>
                </td>
              </tr>
            </table>

          </td>

        <tr>
          <td align="center" bgcolor="#e9ecef">

            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
              <tr>
                <td align="left" bgcolor="#ffffff" style="padding: 36px 24px 0; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; border-top: 3px solid #d4dadf;">
                  <h1 style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 48px;">Mengatur Ulang Kata Sandi Anda</h1>
                </td>
              </tr>
            </table>

          </td>
        </tr>
 
        <tr>
          <td align="center" bgcolor="#e9ecef">

            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
    
              <tr>
                <td align="left" bgcolor="#ffffff" style="padding: 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px;">
                  <p style="margin: 0;">
                    Kesulitan masuk?<br>Mereset kata sandi Anda mudah.<br><br>Cukup tekan tombol di bawah dan ikuti petunjuknya. Kami akan segera menyiapkan dan menjalankannya.</p>
                </td>
              </tr>

              <tr>
                <td align="left" bgcolor="#ffffff">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" bgcolor="#ffffff" style="padding: 12px;">
                        <table border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" bgcolor="#1a82e2" style="border-radius: 6px;">
                              <a href="${url}" target="_blank" style="display: inline-block; padding: 16px 36px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 6px;">Menetapkan semula kata laluan</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>


              <tr>
                <td align="left" bgcolor="#ffffff" style="padding: 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; border-bottom: 3px solid #d4dadf">
                  <p style="margin: 0;">Hitori API,<br> Api</p>
                </td>
              </tr>
    
            </table>

          </td>
        </tr>

        <tr>
          <td align="center" bgcolor="#e9ecef" style="padding: 24px;">

            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
    
              <tr>
                <td align="center" bgcolor="#e9ecef" style="padding: 12px 24px; font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #666;">
                  <p style="margin: 0;">Jika Anda tidak mengajukan permintaan ini, harap abaikan email ini.</p>
                </td>
              </tr>
    
            </table>

          </td>
        </tr>
    
      </table>
    
    </body>
    </html>

    `,
      },
      (error, info) => {
        if (error) {
          resolve('error');
          console.log(`[!] Warning SMTP error ,Limit Habis`);
        } else {
          resolve();
        }
      }
    );
  });
};

module.exports.sendVerifyEmail = async (email, verificationCode, token) => {
  return new Promise(async (resolve, reject) => {
    const url = `http://my.hitori.pw/verify/${token}`;

    await smtpTransport.sendMail(
      {
        from: 'hitori@hitori.pw',
        to: email,
        subject: `Verifikasi Email`,
        html: `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');

              body {
                margin: 0;
                padding: 0;
                font-family: 'Roboto', sans-serif;
                background-color: #f4f4f7;
                color: #51545e;
              }

              .email-wrapper {
                width: 100%;
                padding: 20px;
                background-color: #f4f4f7;
              }

              .email-content {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }

              .email-header {
                background-color: #1a82e2;
                padding: 20px;
                text-align: center;
                color: #ffffff;
              }

              .email-header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
              }

              .email-body {
                padding: 30px;
                font-size: 16px;
                line-height: 1.5;
                color: #51545e;
              }

              .email-body h2 {
                text-align: center;
                background-color: #1a82e2;
                color: #ffffff;
                padding: 10px;
                border-radius: 5px;
                font-size: 20px;
              }

              .email-body p {
                margin: 20px 0;
              }

              .email-body .button {
                display: block;
                width: 200px;
                margin: 20px auto;
                padding: 15px 0;
                text-align: center;
                background-color: #1a82e2;
                color: #ffffff;
                text-decoration: none;
                border-radius: 5px;
                font-size: 18px;
                font-weight: 700;
              }

              .email-footer {
                padding: 20px;
                text-align: center;
                font-size: 14px;
                color: #6b6e76;
                background-color: #f4f4f7;
              }

              .email-footer p {
                margin: 0;
              }
            </style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-content">
                <div class="email-header">
                  <h1>Verifikasi Alamat Email Anda</h1>
                </div>
                <div class="email-body">
                  <p>Terima kasih telah mendaftar di <strong>Hitori Api</strong>. Kami hanya perlu memastikan bahwa alamat email ini adalah milik Anda.</p>
                  <h2>${verificationCode}</h2>
                  <p>Klik tombol di bawah ini untuk memverifikasi akun Anda:</p>
                  <a href="${url}" class="button">Verifikasi Email</a>
                  <p>Jika Anda tidak meminta verifikasi akun, Anda dapat mengabaikan email ini dengan aman.</p>
                </div>
                <div class="email-footer">
                  <p>&copy; ${new Date().getFullYear()} Api. Semua Hak Dilindungi.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      },
      (error, info) => {
        if (error) {
          console.error('[!] Warning SMTP error:', error);
          reject('error');
        } else {
          resolve();
        }
      }
    );
  });
};
