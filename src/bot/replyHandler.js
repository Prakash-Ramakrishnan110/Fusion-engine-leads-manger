/**
 * Inbound Reply Handler (WhatsApp open-wa v4.x + Gemini AI Bot)
 * 
 * Handles incoming messages from prospects who initiate contact or reply.
 * Strictly strictly NO cold outbound DMs!
 */

const { BRAND } = require('../../config');
const { callGemini } = require('../ai/auditorAndWriter');
const { logMessage, appendSystemLog, updateSettings } = require('../../data/db');

let waClientInstance = null;
let isWaInitializing = false;

/**
 * Initializes open-wa client for inbound WhatsApp message listening
 */
async function initializeWhatsAppBot() {
  if (waClientInstance || isWaInitializing) return;
  isWaInitializing = true;

  try {
    const wa = require('@open-wa/wa-automate');
    appendSystemLog('INFO', 'Initializing WhatsApp Client (@open-wa/wa-automate v4.76.0)...');

    wa.create({
      sessionId: 'FUSION_ENGINE_SESSION',
      authTimeout: 90,
      blockCrashLogs: true,
      disableSpins: true,
      headless: false,
      logConsoleErrors: false,
      popup: true,
      useChrome: true,
      qrTimeout: 0
    }).then(client => {
      waClientInstance = client;
      isWaInitializing = false;
      updateSettings({ whatsappConnected: true });
      appendSystemLog('INFO', 'WhatsApp Client initialized successfully. Listening for inbound replies...');

      // Listen for incoming messages
      client.onMessage(async message => {
        await handleInboundWhatsAppMessage(client, message);
      });
    }).catch(err => {
      isWaInitializing = false;
      updateSettings({ whatsappConnected: false });
      appendSystemLog('WARN', `WhatsApp Bot Initialization Notice: ${err.message}. Running in passive/click-to-chat mode.`);
    });
  } catch (err) {
    isWaInitializing = false;
    appendSystemLog('WARN', `@open-wa/wa-automate not active or headful browser unavailable. Operating in click-to-chat mode.`);
  }
}

async function handleInboundWhatsAppMessage(client, message) {
  if (!message || message.isGroupMsg) return;

  const senderPhone = message.from;
  const senderText = message.body;

  appendSystemLog('INFO', `Received inbound WhatsApp reply from ${senderPhone}: "${senderText.substring(0, 40)}..."`);

  // Generate AI Reply using Gemini
  const prompt = `You are the lead engineering assistant at Fusion Engine Technology (fusionengine.in).
A prospective client sent us this WhatsApp message:
"${senderText}"

Services we offer: Custom ERPs, LMS portals, Web & Mobile Apps, AI Automation, Firmware/IoT.
Portfolio: ${BRAND.portfolio}
Website: ${BRAND.website}

Write a short, professional, helpful 2-3 sentence response inviting them to share their exact requirements or schedule a discovery call. Keep it friendly and concise.`;

  try {
    const aiReply = await callGemini(prompt);
    
    // Auto-reply back if client is available
    if (client && typeof client.sendText === 'function') {
      await client.sendText(senderPhone, aiReply);
      appendSystemLog('INFO', `Replied to WhatsApp lead ${senderPhone} with AI response.`);
    }

    logMessage({
      type: 'WHATSAPP_INBOUND_REPLY',
      sender: senderPhone,
      text: senderText,
      replySent: aiReply
    });

    return aiReply;
  } catch (err) {
    appendSystemLog('ERROR', `Failed to generate AI WhatsApp reply: ${err.message}`);
    return `Thank you for reaching out to Fusion Engine Technology! We've received your message. You can also view our portfolio at ${BRAND.portfolio}.`;
  }
}

/**
 * Handles simulated or webhook inbound messages for testing / manual entry
 */
async function processInboundReply(channel, sender, text) {
  appendSystemLog('INFO', `Processing inbound ${channel} reply from ${sender}...`);

  const prompt = `You are a Technical Account Lead at Fusion Engine Technology (fusionengine.in).
Prospect (${sender}) replied via ${channel}:
"${text}"

Write a concise, high-converting professional follow-up response. Reference our portfolio (${BRAND.portfolio}) and offer a quick discovery call.`;

  let replyText = '';
  try {
    replyText = await callGemini(prompt);
  } catch (_) {
    replyText = `Hi ${sender}, thanks for reaching out to Fusion Engine Technology. We would love to discuss your custom software requirements. Please check out our work at ${BRAND.portfolio} and let us know your availability for a call.`;
  }

  logMessage({
    type: `${channel.toUpperCase()}_INBOUND_REPLY`,
    sender,
    text,
    replyGenerated: replyText
  });

  return replyText;
}

/**
 * Automates outbound WhatsApp messages using open-wa.
 * Gracefully falls back to manual Click-to-Chat if uninitialized.
 */
async function sendOutboundWhatsApp(phone, text) {
  if (waClientInstance) {
    try {
      const chatId = `${phone.replace(/\D/g, '')}@c.us`;
      await waClientInstance.sendText(chatId, text);
      appendSystemLog('INFO', `[WhatsApp Autopilot] Sent outbound message to ${phone}`);
      logMessage({
        type: 'WHATSAPP_DISPATCH',
        sender: 'Fusion_Engine_Bot',
        receiver: phone,
        content: text,
        timestamp: new Date().toISOString()
      });
      return true;
    } catch (err) {
      appendSystemLog('ERROR', `[WhatsApp Autopilot] Failed to send to ${phone}: ${err.message}`);
    }
  } else {
    // Graceful fallback if open-wa isn't initialized or npm install failed
    appendSystemLog('WARN', `[WhatsApp Mode: Manual] Autopilot unavailable. Generated message for ${phone} saved. Requires manual dispatch via dashboard Click-to-Chat.`);
    logMessage({
      type: 'WHATSAPP_DISPATCH_PENDING',
      sender: 'System',
      receiver: phone,
      content: text,
      timestamp: new Date().toISOString()
    });
  }
  return false;
}

module.exports = {
  initializeWhatsAppBot,
  handleInboundWhatsAppMessage,
  processInboundReply,
  sendOutboundWhatsApp
};
