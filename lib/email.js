// Gmail SMTP via nodemailer. Uses an app password (jiahsagent@gmail.com).
import nodemailer from 'nodemailer';

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_ADDRESS / GMAIL_APP_PASSWORD missing');
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return _transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const from = `Tao Wallet Report <${process.env.GMAIL_ADDRESS}>`;
  const info = await transporter().sendMail({ from, to, subject, html, text });
  return { messageId: info.messageId, accepted: info.accepted };
}
