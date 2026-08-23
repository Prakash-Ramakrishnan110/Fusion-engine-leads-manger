/**
 * WhatsApp Dispatcher & Link Generator
 * 
 * STRICT COMPLIANCE REQUIREMENT:
 * Absolutely NO automated outbound cold WhatsApp messages to arbitrary phone numbers.
 * WhatsApp cold touches strictly generate pre-filled `https://wa.me/916369884331?text=...`
 * click-to-chat links so the prospect opts in by initiating contact.
 */

const { BRAND } = require('../../config');
const { isOptedOut } = require('./optOutManager');
const { normalizePhone } = require('../utils/dedupe');

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

  const messageText = customMessage || lead.pitchMessage || defaultMsg;
  const encodedText = encodeURIComponent(messageText);

  // Agency WhatsApp target number: wa.me/916369884331
  const waUrl = `https://wa.me/${BRAND.whatsappClean}?text=${encodedText}`;

  return {
    allowed: true,
    url: waUrl,
    cleanPhone: normalizePhone(lead.phone),
    encodedMessage: messageText
  };
}

module.exports = {
  generateClickToChatLink
};
