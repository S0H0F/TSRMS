const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const { query } = require('../config/database');

// ── SMTP Transporter ──────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── SMS via Twilio ────────────────────────────────────────────
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (_) { logger.warn('Twilio not configured — SMS disabled'); }

// ── Email Template ────────────────────────────────────────────
function buildConfirmationEmail(data) {
  const { bookingRef, trainId, from, to, date, dep, seat, amount, passengerName, qrCode } = data;
  return {
    subject: `Booking Confirmed — ${bookingRef} | تأكيد الحجز`,
    html: `
<!DOCTYPE html>
<html dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#F2F5F3;margin:0;padding:20px;}
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,102,51,0.10);}
  .header{background:linear-gradient(135deg,#004D26,#006633);padding:28px 32px;text-align:center;}
  .logo{font-size:36px;}
  .header h1{color:#C9A84C;font-size:20px;margin:8px 0 4px;}
  .header p{color:rgba(255,255,255,0.70);font-size:13px;}
  .body{padding:28px 32px;}
  .confirm-badge{background:#E8F5EE;border:1px solid #B8D9C6;border-radius:10px;padding:12px 16px;text-align:center;margin-bottom:22px;}
  .confirm-badge h2{color:#006633;font-size:18px;margin:0 0 4px;}
  .confirm-badge p{color:#4A6858;font-size:13px;margin:0;}
  .route-row{display:flex;align-items:center;justify-content:space-between;background:#F8FBF9;border-radius:10px;padding:16px;margin-bottom:18px;}
  .station{text-align:center;}
  .st-name{font-size:18px;font-weight:700;color:#112218;}
  .st-time{font-size:12px;color:#7A9888;margin-top:3px;}
  .arrow{font-size:20px;color:#C9A84C;}
  .details{border-top:1px solid #D8E5DD;padding-top:18px;}
  .dr{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #EEF4F0;font-size:13px;}
  .dr:last-child{border:none;}
  .dl{color:#7A9888;}
  .dv{font-weight:600;color:#112218;}
  .qr-section{text-align:center;padding:20px 0;border-top:1px solid #D8E5DD;margin-top:16px;}
  .qr-section img{width:140px;border-radius:8px;}
  .qr-section p{font-size:11px;color:#7A9888;margin-top:6px;}
  .footer{background:#F8FBF9;padding:18px 32px;text-align:center;font-size:11px;color:#7A9888;}
  .total-row{background:#EFF7F2;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;margin-top:12px;}
  .total-label{font-size:14px;font-weight:700;color:#4A6858;}
  .total-val{font-size:20px;font-weight:800;color:#006633;}
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">🚆</div>
    <h1>RailWay SA</h1>
    <p>ريلوي السعودية</p>
  </div>
  <div class="body">
    <div class="confirm-badge">
      <h2>✅ Booking Confirmed | تم تأكيد الحجز</h2>
      <p>Reference: <strong>${bookingRef}</strong></p>
    </div>
    <div class="route-row">
      <div class="station"><div class="st-name">${from}</div><div class="st-time">${dep}</div></div>
      <div class="arrow">→</div>
      <div class="station"><div class="st-name">${to}</div><div class="st-time">${date}</div></div>
    </div>
    <div class="details">
      <div class="dr"><span class="dl">Passenger / الراكب</span><span class="dv">${passengerName}</span></div>
      <div class="dr"><span class="dl">Train / القطار</span><span class="dv">${trainId}</span></div>
      <div class="dr"><span class="dl">Date / التاريخ</span><span class="dv">${date}</span></div>
      <div class="dr"><span class="dl">Seat / المقعد</span><span class="dv">${seat}</span></div>
    </div>
    <div class="total-row">
      <span class="total-label">Amount Paid / المبلغ المدفوع</span>
      <span class="total-val">SAR ${amount}</span>
    </div>
    ${qrCode ? `<div class="qr-section"><img src="${qrCode}" alt="QR Code"/><p>Scan at boarding gate | امسح عند البوابة</p></div>` : ''}
  </div>
  <div class="footer">
    This is an automated confirmation. Do not reply to this email.<br>
    هذا بريد تأكيد آلي. لا تقم بالرد على هذه الرسالة.
  </div>
</div>
</body></html>`,
  };
}

// ── SMS Template ──────────────────────────────────────────────
function buildSmsMessage(data) {
  const { bookingRef, from, to, date, dep, seat, amount } = data;
  return `RailWay SA: Booking confirmed ✅\nRef: ${bookingRef}\n${from} → ${to}\nDate: ${date} at ${dep}\nSeat: ${seat}\nSAR ${amount}\nتم تأكيد حجزك`;
}

// ── Log to DB ─────────────────────────────────────────────────
async function logNotification({ userId, bookingId, type, channel, subject, message, status, error }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, booking_id, type, channel, subject, message, status, sent_at, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, bookingId || null, type, channel, subject || null, message, status, status === 'sent' ? new Date() : null, error || null]
    );
  } catch (e) { logger.error('Failed to log notification:', e.message); }
}

// ── Main: Send Booking Confirmation ──────────────────────────
async function sendBookingConfirmation(data) {
  const { email, phone, userId, bookingId } = data;
  const results = { email: null, sms: null };

  // Email
  if (email && process.env.SMTP_USER) {
    try {
      const { subject, html } = buildConfirmationEmail(data);
      await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'RailWay SA'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject,
        html,
      });
      results.email = 'sent';
      logger.info(`Email sent to ${email} for booking ${data.bookingRef}`);
      await logNotification({ userId, bookingId, type: 'email', channel: email, subject, message: `Booking confirmation for ${data.bookingRef}`, status: 'sent' });
    } catch (err) {
      results.email = 'failed';
      logger.error(`Email failed to ${email}:`, err.message);
      await logNotification({ userId, bookingId, type: 'email', channel: email, subject: 'Booking confirmation', message: err.message, status: 'failed', error: err.message });
    }
  }

  // SMS
  if (phone && twilioClient) {
    try {
      const message = buildSmsMessage(data);
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   phone.startsWith('+') ? phone : `+966${phone.slice(1)}`,
      });
      results.sms = 'sent';
      logger.info(`SMS sent to ${phone} for booking ${data.bookingRef}`);
      await logNotification({ userId, bookingId, type: 'sms', channel: phone, message: buildSmsMessage(data), status: 'sent' });
    } catch (err) {
      results.sms = 'failed';
      logger.error(`SMS failed to ${phone}:`, err.message);
      await logNotification({ userId, bookingId, type: 'sms', channel: phone, message: err.message, status: 'failed', error: err.message });
    }
  }

  return results;
}

// ── Send Cancellation Notice ──────────────────────────────────
async function sendCancellationNotice({ email, phone, bookingRef, from, to, date }) {
  if (email && process.env.SMTP_USER) {
    try {
      await transporter.sendMail({
        from: `"RailWay SA" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject: `Booking Cancelled — ${bookingRef} | تم الإلغاء`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px;"><h2 style="color:#C0392B;">❌ Booking Cancelled</h2><p>Your booking <strong>${bookingRef}</strong> for ${from} → ${to} on ${date} has been cancelled.</p><p>A refund will be processed within 3–5 business days.</p><hr><p style="color:#888;font-size:12px;">RailWay SA — ريلوي السعودية</p></div>`,
      });
    } catch (err) { logger.error('Cancellation email failed:', err.message); }
  }
  if (phone && twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `RailWay SA: Booking ${bookingRef} cancelled. Refund in 3-5 days. | تم إلغاء الحجز ${bookingRef}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   phone.startsWith('+') ? phone : `+966${phone.slice(1)}`,
      });
    } catch (err) { logger.error('Cancellation SMS failed:', err.message); }
  }
}

module.exports = { sendBookingConfirmation, sendCancellationNotice };
