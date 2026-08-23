/**
 * Lead Deduplication and Normalization Utility
 */

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  // Remove all non-digits except leading +
  return phone.replace(/[^\d+]/g, '');
}

function extractDomain(urlOrDomain) {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') return '';
  try {
    let clean = urlOrDomain.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.replace(/^www\./, '');
  } catch (_) {
    return urlOrDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

/**
 * Checks whether a candidate lead matches any existing lead in the dataset
 */
function isDuplicateLead(candidate, existingLeads = []) {
  const candidateEmail = normalizeEmail(candidate.email);
  const candidatePhone = normalizePhone(candidate.phone);
  const candidateDomain = extractDomain(candidate.website || candidate.domain);
  const candidateName = (candidate.name || '').trim().toLowerCase();

  return existingLeads.some(existing => {
    // 1. Match on email
    if (candidateEmail && normalizeEmail(existing.email) === candidateEmail) {
      return true;
    }
    // 2. Match on phone
    if (candidatePhone && candidatePhone.length > 7 && normalizePhone(existing.phone) === candidatePhone) {
      return true;
    }
    // 3. Match on domain
    if (candidateDomain && candidateDomain.length > 3 && extractDomain(existing.website || existing.domain) === candidateDomain) {
      return true;
    }
    // 4. Exact business name match in same region
    if (candidateName && candidateName.length > 3 && (existing.name || '').toLowerCase() === candidateName && existing.region === candidate.region) {
      return true;
    }
    return false;
  });
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  extractDomain,
  isDuplicateLead
};
