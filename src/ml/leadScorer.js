/**
 * Rule-Based Weighted Lead Scorer
 * 
 * Scores prospective leads from 0 to 100 based on quantifiable data quality,
 * contactability, industry alignment, site indicators, and regional match.
 */

const { TARGET_CATEGORIES, TARGET_REGIONS } = require('../../config');

function scoreLead(lead) {
  let score = 0;
  const breakdown = [];

  // 1. Email Availability (+25)
  if (lead.email && lead.email.includes('@')) {
    score += 25;
    breakdown.push({ criteria: 'Direct Email Available', points: 25 });
  }

  // 2. Phone Availability (+15)
  if (lead.phone && lead.phone.length >= 8) {
    score += 15;
    breakdown.push({ criteria: 'Direct Phone Available', points: 15 });
  }

  // 3. Website Presence & HTTPS (+15)
  if (lead.website && lead.website.startsWith('http')) {
    score += 15;
    breakdown.push({ criteria: 'Active Website Present', points: 15 });
  } else if (lead.website) {
    score += 10;
    breakdown.push({ criteria: 'Website Domain Present', points: 10 });
  }

  // 4. Social / Reviews Signal (+15)
  if (lead.rating && lead.rating >= 4.0 && lead.reviewsCount && lead.reviewsCount > 5) {
    score += 15;
    breakdown.push({ criteria: 'Established Reputation (Rating 4.0+ & Reviews)', points: 15 });
  } else if (lead.reviewsCount && lead.reviewsCount > 0) {
    score += 8;
    breakdown.push({ criteria: 'Active Business Profile', points: 8 });
  }

  // 5. Industry Relevance Match (+15)
  const categoryMatch = TARGET_CATEGORIES.find(c => c.id === lead.category);
  if (categoryMatch) {
    score += 15;
    breakdown.push({ criteria: `Target Category Match (${categoryMatch.name})`, points: 15 });
  } else if (lead.category) {
    score += 8;
    breakdown.push({ criteria: 'General Service Match', points: 8 });
  }

  // 6. Regional Target Match (+15)
  const regionMatch = TARGET_REGIONS.find(r => r.id === lead.region);
  if (regionMatch) {
    score += 15;
    breakdown.push({ criteria: `Target Region Match (${regionMatch.id})`, points: 15 });
  } else if (lead.region) {
    score += 8;
    breakdown.push({ criteria: 'Region Specified', points: 8 });
  }

  // Determine Tier
  let tier = 'Cold';
  if (score >= 85) {
    tier = 'Hot';
  } else if (score >= 50) {
    tier = 'Warm';
  }

  // Estimate potential deal value based on category
  let estimatedValue = 2500;
  if (lead.category === 'ERP') estimatedValue = 8500;
  else if (lead.category === 'LMS') estimatedValue = 6000;
  else if (lead.category === 'Apps') estimatedValue = 4500;
  else if (lead.category === 'AI') estimatedValue = 5000;
  else if (lead.category === 'Firmware') estimatedValue = 7500;

  return {
    score: Math.min(100, Math.max(0, score)),
    tier,
    estimatedValue,
    breakdown,
    scoredAt: new Date().toISOString()
  };
}

module.exports = {
  scoreLead
};
