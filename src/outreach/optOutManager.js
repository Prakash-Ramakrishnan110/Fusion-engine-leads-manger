/**
 * Shared Opt-Out Manager
 * Checks email, phone, and domain against the global exclusion list
 */

const { getOptOuts, addOptOut, removeOptOut } = require('../../data/db');
const { normalizeEmail, normalizePhone, extractDomain } = require('../utils/dedupe');

function isOptedOut(target) {
  if (!target) return false;
  const optList = getOptOuts().map(item => String(item).toLowerCase().trim());

  const cleanTarget = String(target).toLowerCase().trim();
  const cleanEmail = normalizeEmail(target);
  const cleanPhone = normalizePhone(target);
  const cleanDomain = extractDomain(target);

  return optList.some(item => {
    if (item === cleanTarget) return true;
    if (cleanEmail && item === cleanEmail) return true;
    if (cleanPhone && cleanPhone.length > 5 && item === cleanPhone) return true;
    if (cleanDomain && cleanDomain.length > 3 && item === cleanDomain) return true;
    return false;
  });
}

async function registerOptOut(identifier) {
  if (!identifier) return;
  const clean = String(identifier).trim().toLowerCase();
  await addOptOut(clean);
}

async function unregisterOptOut(identifier) {
  if (!identifier) return;
  const clean = String(identifier).trim().toLowerCase();
  await removeOptOut(clean);
}

module.exports = {
  isOptedOut,
  registerOptOut,
  unregisterOptOut
};
