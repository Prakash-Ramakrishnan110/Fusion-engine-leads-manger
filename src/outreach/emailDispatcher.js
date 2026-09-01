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
const path = require('path');
const { BRAND, PORTFOLIO_ITEMS } = require('../../config');
const { isOptedOut } = require('./optOutManager');
const { getSettings, updateSettings, logMessage, appendSystemLog } = require('../../data/db');

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

/**
 * Builds the rich HTML email template matching the modern dark/light card design.
 */
function buildRichHtmlTemplate(lead, bodyText, unsubscribeUrl) {
  // Use regex to wrap numbered lists (like 1. 2. 3.) in bold if they appear at the start of a paragraph
  let formattedBody = bodyText.replace(/\n/g, '<br>');
  formattedBody = formattedBody.replace(/(<br>|^)(\d+\.\s+.*?)(<br>|$)/g, '$1<strong>$2</strong>$3');

  const keys = lead.portfolioKeys || [];
  let portfolioItemsHtml = '';
  
  if (keys.length > 0) {
    portfolioItemsHtml = `
      <!-- Portfolio Section -->
      <div style="margin-top: 50px;">
        <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 20px; text-align: center;">Here are some we have already built</p>
    `;
    
    keys.forEach((key, index) => {
      const item = PORTFOLIO_ITEMS[key] || PORTFOLIO_ITEMS['erp'];
      const cid = `portfolio_item_${index}`;
      const imgSrc = item.image.startsWith('http') ? item.image : `cid:${cid}`;
      
      portfolioItemsHtml += `
          <!-- Item ${index + 1} -->
          <div style="margin-bottom: 30px; background-color: #ffffff; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb;">
            <img src="${imgSrc}" alt="${item.title}" style="width: 100%; height: auto; border-radius: 2px; margin-bottom: 15px;" />
            <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #111827;">${item.title}</h3>
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #4b5563;">${item.description}</p>
            <a href="${BRAND.website}" style="color: #d97706; font-size: 14px; text-decoration: none; font-weight: bold;">See how this was built &rarr;</a>
          </div>
      `;
    });
    
    portfolioItemsHtml += `</div>`;
  }

  return `
<div style="background-color: #111111; padding: 40px 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6;">

  <!-- Main Card -->
  <div style="max-width: 600px; margin: 0 auto; background-color: #fdfbf7; border-radius: 4px; overflow: hidden;">
    
    <!-- Top colorful bar -->
    <div style="display: flex; height: 6px;">
      <div style="flex: 1; background-color: #f97316;"></div>
      <div style="flex: 1; background-color: #eab308;"></div>
      <div style="flex: 1; background-color: #10b981;"></div>
      <div style="flex: 1; background-color: #3b82f6;"></div>
    </div>

    <!-- Content Padding -->
    <div style="padding: 40px;">
      
      <!-- Logo Header -->
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${BRAND.website}" target="_blank" style="text-decoration: none; display: inline-block;">
          <img src="https://www.fusionengine.in/header-logo.png" alt="Fusion Engine Technology" style="max-width: 200px; max-height: 80px; height: auto; display: block; margin: 0 auto; border: 0;" />
        </a>
      </div>
      
      <!-- AI Generated Body -->
      <div style="font-size: 16px; color: #1f2937;">
        ${formattedBody}
      </div>

      <!-- Main CTA -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${BRAND.website}" style="display: inline-block; background-color: #eab308; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 30px; border-radius: 4px; font-size: 16px;">Explore our solutions &rarr;</a>
      </div>

      ${portfolioItemsHtml}

      <!-- Services Section -->
      <div style="margin-top: 50px;">
        <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 20px; text-align: center;">And the rest of what we do</p>
        
        <div style="background-color: #f3f4f6; border-radius: 4px; padding: 20px;">
          <!-- Service 1 -->
          <div style="margin-bottom: 20px;">
            <div style="font-size: 20px; margin-bottom: 5px; color: #d97706;">⚡</div>
            <h4 style="margin: 0 0 5px 0; font-size: 15px; color: #111827;">AI & Workflow Automation</h4>
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #4b5563;">Intelligent bots, document extractors, and LLM-powered assistants.</p>
            <a href="${BRAND.website}" style="color: #d97706; font-size: 12px; text-decoration: none; font-weight: bold;">Learn more &rarr;</a>
          </div>
          
          <!-- Service 2 -->
          <div style="margin-bottom: 20px;">
            <div style="font-size: 20px; margin-bottom: 5px; color: #d97706;">📱</div>
            <h4 style="margin: 0 0 5px 0; font-size: 15px; color: #111827;">Web & Mobile Applications</h4>
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #4b5563;">Native and cross-platform apps designed for specific operational requirements.</p>
            <a href="${BRAND.website}" style="color: #d97706; font-size: 12px; text-decoration: none; font-weight: bold;">Learn more &rarr;</a>
          </div>

          <!-- Service 3 -->
          <div>
            <div style="font-size: 20px; margin-bottom: 5px; color: #d97706;">⚙️</div>
            <h4 style="margin: 0 0 5px 0; font-size: 15px; color: #111827;">Firmware & IoT</h4>
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #4b5563;">Custom telemetry dashboards and hardware-software communication systems.</p>
            <a href="${BRAND.website}" style="color: #d97706; font-size: 12px; text-decoration: none; font-weight: bold;">Learn more &rarr;</a>
          </div>
        </div>
      </div>

      <!-- WhatsApp Call to Action -->
      <div style="text-align: center; margin-top: 50px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #1f2937; margin-bottom: 20px;">For a useful, rapid and free analysis through WhatsApp, just tap below.</p>
        <a href="${BRAND.whatsappLink}" style="display: inline-block; background-color: #22c55e; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 40px; border-radius: 30px; font-size: 16px;">Chat on WhatsApp</a>
      </div>

      <!-- Signature -->
      <div style="margin-top: 40px; font-size: 14px; color: #1f2937;">
        <p style="font-weight: bold; margin: 0 0 5px 0;">${BRAND.name}</p>
        <p style="color: #6b7280; margin: 0;">Engineering & Architecture Team</p>
      </div>

    </div>
  </div>

  <!-- Footer -->
  <div style="max-width: 600px; margin: 30px auto 0 auto; text-align: center; font-size: 12px; color: #6b7280; line-height: 1.5;">
    <p style="margin: 0 0 10px 0;"><strong>${BRAND.name}</strong> &mdash; ${BRAND.address}</p>
    <p style="margin: 0 0 10px 0;">Website: <a href="${BRAND.website}" style="color: #a3a3a3; text-decoration: underline;">${BRAND.website}</a> | WhatsApp: <a href="${BRAND.whatsappLink}" style="color: #a3a3a3; text-decoration: underline;">${BRAND.whatsappNumber}</a></p>
    <p style="margin: 0;"><a href="${unsubscribeUrl}" style="color: #a3a3a3; text-decoration: underline;">Unsubscribe from our emails</a></p>
  </div>
</div>`;
}

const BLOCKED_OUTREACH_DOMAINS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'youtube.com', 'github.com', 'google.com', 'apple.com', 'microsoft.com',
  'schema.org', 'w3.org', 'sentry.io', 'example.com', 'localhost', 'googlemail.com'
];

function isBlockedOutreachEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return true;
  const clean = email.trim().toLowerCase();
  const parts = clean.split('@');
  if (parts.length !== 2) return true;
  const domain = parts[1];
  return BLOCKED_OUTREACH_DOMAINS.some(b => domain === b || domain.endsWith('.' + b));
}

/**
 * Auto-checks if 24 hours have elapsed since Gmail sending limit was hit.
 * If 24 hours passed, automatically re-enables cold email outreach!
 */
function checkAndAutoResumeEmailLimit() {
  let settings = getSettings();
  if (!settings.coldEmailEnabled && settings.emailLimitHitAt) {
    const elapsedMs = Date.now() - new Date(settings.emailLimitHitAt).getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (elapsedHours >= 24) {
      updateSettings({
        coldEmailEnabled: true,
        emailLimitHitAt: null
      });
      appendSystemLog('INFO', `🟢 24 hours elapsed since Gmail daily limit was hit. Automatically re-enabled cold email outreach!`);
      settings = getSettings();
    }
  }
  return settings;
}

async function sendOutreachEmail(lead, pitchSubject = null, pitchBody = null) {
  const settings = checkAndAutoResumeEmailLimit();

  // 1. Kill Switch Check
  if (!settings.coldEmailEnabled) {
    appendSystemLog('WARN', `Cold email outreach is PAUSED (Gmail limit active or manually paused). Skipped send to ${lead.email}`);
    return { success: false, reason: 'Cold email outreach is paused in Settings.' };
  }

  // 2. Target Email Validation & Platform Domain Filter
  if (!lead.email || !lead.email.includes('@')) {
    return { success: false, reason: 'Invalid target email address.' };
  }

  if (isBlockedOutreachEmail(lead.email)) {
    appendSystemLog('WARN', `Outreach send blocked for platform domain email: ${lead.email}`);
    return { success: false, reason: `Target address (${lead.email}) belongs to a blocked social/platform domain (e.g., linkedin.com).` };
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

  const touchCount = lead.touchCount || 0;
  const isFirstTouch = touchCount === 0;
  
  let fullHtml;
  let finalAttachments = [];

  if (isFirstTouch) {
    fullHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${bodyText.replace(/\n/g, '<br>')}</div>${htmlFooter}`;
  } else {
    fullHtml = buildRichHtmlTemplate(lead, bodyText, unsubscribeUrl);
    
    const keys = lead.portfolioKeys || [];
    keys.forEach((key, index) => {
      const item = PORTFOLIO_ITEMS[key] || PORTFOLIO_ITEMS['erp'];
      if (!item.image.startsWith('http')) {
        finalAttachments.push({
          filename: item.image.split('/').pop(),
          path: path.resolve(__dirname, '../../', item.image),
          cid: `portfolio_item_${index}`
        });
      }
    });
  }

  const trackUrl = `http://${apiHost}:${apiPort}/api/track/${lead.id}`;
  fullHtml += `<img src="${trackUrl}" width="1" height="1" style="display:none;" />`;

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"${BRAND.name}" <${BRAND.email}>`,
      to: lead.email,
      subject: subject,
      text: `${bodyText}\n\n---\n${BRAND.name}\n${BRAND.address}\nUnsubscribe: ${unsubscribeUrl}`,
      html: fullHtml,
      attachments: finalAttachments
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
    if (err.message && (err.message.includes('550-5.4.5') || err.message.includes('Daily user sending limit exceeded'))) {
      const nowIso = new Date().toISOString();
      appendSystemLog('ERROR', `🛑 Gmail Daily Sending Limit Reached (500 emails/day)! Auto-pausing cold email outreach. Will automatically resume in 24 hours.`);
      updateSettings({
        coldEmailEnabled: false,
        emailLimitHitAt: nowIso
      });
      return {
        success: false,
        reason: 'Gmail Daily Sending Limit Reached (500 emails/day). Cold email paused automatically for 24 hours.'
      };
    }
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
  verifyUnsubscribeToken,
  checkAndAutoResumeEmailLimit
};
