/**
 * WhatsApp Dispatcher & Link Generator
 * 
 * Supports both:
 * 1. Direct WhatsApp messaging without click-to-chat when WhatsApp client is connected.
 * 2. Fallback Click-to-Chat link generation when WhatsApp client is uninitialized.
 */

const { BRAND } = require('../../config');
const { isOptedOut } = require('./optOutManager');
const { normalizePhone } = require('../utils/dedupe');
const { sendOutboundWhatsApp } = require('../bot/replyHandler');

function generateClickToChatLink(lead, customMessage = null) {
  // 1. Compliance check: Verify lead phone & email against opt-out list
  if (isOptedOut(lead.phone) || isOptedOut(lead.email) || isOptedOut(lead.website)) {
    return {
      allowed: false,
      reason: 'Lead is in the global opt-out list.',
      url: null
    };
  }

  const clientName = lead.name || 'Business Owner';
  const category = lead.category || 'System Engineering';

  const defaultMsg = `Hi Fusion Engine Team,\n\nI am reaching out regarding custom ${category} engineering for ${clientName}.\nOur website is ${lead.website || 'N/A'}.\nLet's discuss how we can work together.`;

  const messageText = customMessage || lead.whatsappIntro || lead.pitchMessage || defaultMsg;
  const encodedText = encodeURIComponent(messageText);

  // Target lead's phone number if available, otherwise agency brand number as fallback
  const cleanLeadPhone = lead.phone ? normalizePhone(lead.phone).replace(/\D/g, '') : '';
  const targetPhone = cleanLeadPhone || BRAND.whatsappClean;
  const waUrl = `https://wa.me/${targetPhone}?text=${encodedText}`;

  return {
    allowed: true,
    url: waUrl,
    cleanPhone: normalizePhone(lead.phone),
    encodedMessage: messageText
  };
}

async function dispatchWhatsAppMessage(lead, customMessage = null) {
  if (isOptedOut(lead.phone) || isOptedOut(lead.email) || isOptedOut(lead.website)) {
    return {
      success: false,
      allowed: false,
      reason: 'Lead is in the global opt-out list.',
      directSent: false
    };
  }

  const clientName = lead.name || 'Business Owner';
  const category = lead.category || 'software';
  const defaultMsg = lead.whatsappIntro || `Hi ${clientName}, reached out from Fusion Engine Technology (${BRAND.website}). We build custom ${category} platforms tailored to your business. Let's connect!`;
  const messageText = customMessage || defaultMsg;

  const targetPhone = lead.phone ? normalizePhone(lead.phone) : '';

  if (targetPhone) {
    const directSent = await sendOutboundWhatsApp(targetPhone, messageText);
    if (directSent) {
      return {
        success: true,
        allowed: true,
        directSent: true,
        phone: targetPhone,
        message: messageText
      };
    }
  }

  // Fallback to Click-to-Chat if WhatsApp bot client is not connected or target phone missing
  const clickObj = generateClickToChatLink(lead, messageText);
  return {
    success: true,
    allowed: true,
    directSent: false,
    url: clickObj.url,
    phone: targetPhone,
    message: messageText
  };
}

module.exports = {
  generateClickToChatLink,
  dispatchWhatsAppMessage
};

