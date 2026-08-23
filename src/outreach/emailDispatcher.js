/**
 * Email Dispatcher (Nodemailer + Free SMTP)
 * 
 * Includes CAN-SPAM & GDPR compliance enforcement:
 * 1. Checks Opt-Out list before every email.
 * 2. Checks Cold Email Kill Switch in Settings.
 * 3. Appends HMAC-signed Unsubscribe link + Fusion Engine physical business address.
 * 4. Logs dispatch event in message_log.json.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { BRAND } = require('../../config');
const { isOptedOut } = require('./optOutManager');
const { getSettings, logMessage, appendSystemLog } = require('../../data/db');

/**
 * Generates secure HMAC token for a given email address to prevent unauthorized unsubscribes / enumeration
 */
function generateUnsubscribeToken(email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'fusion_engine_default_hmac_secret_2026';
  return crypto.createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex');
}

/**
 * Validates HMAC token for unsubscribe requests
 */
function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expectedToken = generateUnsubscribeToken(email);
  const bufA = Buffer.from(String(token));
  const bufB = Buffer.from(String(expectedToken));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createTransporter() {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || BRAND.email;
  const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (!smtpPass) {
    throw new Error('SMTP_PASS is not configured in .env or Settings.');
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

async function sendOutreachEmail(lead, pitchSubject = null, pitchBody = null) {
  const settings = getSettings();

  // 1. Kill Switch Check
  if (!settings.coldEmailEnabled) {
    appendSystemLog('WARN', `Cold email kill switch is ACTIVE. Skipped send to ${lead.email}`);
    return { success: false, reason: 'Cold email kill switch is enabled in Settings.' };
  }

  // 2. Target Email Validation
  if (!lead.email || !lead.email.includes('@')) {
    return { success: false, reason: 'Invalid target email address.' };
  }

  // 3. Opt-Out Verification Check
  if (isOptedOut(lead.email) || isOptedOut(lead.website) || isOptedOut(lead.phone)) {
    appendSystemLog('WARN', `Opt-out check blocked send to ${lead.email}`);
    return { success: false, reason: 'Recipient or domain is in the opt-out list.' };
  }

  // 4. Generate Unsubscribe HMAC URL & Compliance Footer
  const token = generateUnsubscribeToken(lead.email);
  const apiHost = process.env.HOST || '127.0.0.1';
  const apiPort = process.env.PORT_API || 3000;
  const unsubscribeUrl = `http://${apiHost}:${apiPort}/api/unsubscribe?email=${encodeURIComponent(lead.email)}&token=${token}`;

  let subject = pitchSubject || lead.pitchSubject || `Engineering & Tech Automation for ${lead.name}`;
  let bodyText = pitchBody || lead.pitchBody || `Hi ${lead.name},\n\nWe build custom ERPs, LMS portals, and web/mobile apps at ${BRAND.website}.\nPortfolio: ${BRAND.portfolio}\nWhatsApp: ${BRAND.whatsappLink}\n\nBest regards,\n${BRAND.name}`;

  // Sanitize any accidental raw JSON syntax or markdown wrappers
  if (typeof bodyText === 'string' && (bodyText.includes('```json') || bodyText.includes('"emailBody":'))) {
    const matchBody = bodyText.match(/"emailBody"\s*:\s*"([\s\S]*?)"\s*,\s*"whatsappIntro"/);
    if (matchBody && matchBody[1]) {
      bodyText = matchBody[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      bodyText = bodyText.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
  }

  const htmlFooter = `
<br><hr style="border:0; border-top:1px solid #E2E8F0; margin-top:24px; margin-bottom:16px;">
<div style="font-size:12px; color:#64748B; font-family:sans-serif; line-height:1.5;">
  <p style="margin:0 0 6px 0;"><strong>${BRAND.name}</strong> — Custom ERPs, LMS Platforms, Mobile & Web Apps, AI & Firmware</p>
  <p style="margin:0 0 6px 0;">Website: <a href="${BRAND.website}" style="color:#2563EB;">${BRAND.website}</a> | Portfolio: <a href="${BRAND.portfolio}" style="color:#2563EB;">${BRAND.portfolio}</a></p>
  <p style="margin:0 0 6px 0;">Contact Address: ${BRAND.address}</p>
  <p style="margin:6px 0 0 0;"><a href="${unsubscribeUrl}" style="color:#64748B; text-decoration:underline;">Unsubscribe from outreach emails</a></p>
</div>`;

  const fullHtml = `
<div style="font-family:sans-serif; font-size:14px; color:#0F172A; line-height:1.6;">
  ${bodyText.replace(/\n/g, '<br>')}
  ${htmlFooter}
</div>`;

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"${BRAND.name}" <${BRAND.email}>`,
      to: lead.email,
      subject: subject,
      text: `${bodyText}\n\n---\n${BRAND.name}\n${BRAND.address}\nUnsubscribe: ${unsubscribeUrl}`,
      html: fullHtml
    });

    // Audit Log
    logMessage({
      type: 'EMAIL_DISPATCH',
      recipient: lead.email,
      leadId: lead.id,
      leadName: lead.name,
      subject,
      messageId: info.messageId
    });

    appendSystemLog('INFO', `Successfully dispatched email to ${lead.email} (${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      sentAt: new Date().toISOString()
    };
  } catch (err) {
    appendSystemLog('ERROR', `Email dispatch failed to ${lead.email}: ${err.message}`);
    return {
      success: false,
      reason: err.message
    };
  }
}

module.exports = {
  sendOutreachEmail,
  generateUnsubscribeToken,
  verifyUnsubscribeToken
};
