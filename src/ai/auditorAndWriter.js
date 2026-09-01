/**
 * AI Auditor and Pitch/Proposal Generator
 * Powered by Google Gemini 1.5 Flash API with request queue & rate-limiting fallback
 */

require('dotenv').config();
const axios = require('axios');
const { geminiLimiter } = require('../utils/rateLimiter');
const { BRAND, DEFAULT_PROMPT_TEMPLATE } = require('../../config');
const { getSettings } = require('../../data/db');

/**
 * Calls Google Gemini REST API or SDK securely
 */
/**
 * Calls Google Gemini REST API securely with model fallback cascade
 */
async function callGemini(promptText, apiKeyOverride = null) {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in .env or Settings.');
  }

  // Model fallback chain if a specific model encounters 503/429 limits
  const modelCandidates = ['gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      };

      const response = await geminiLimiter.enqueue(async () => {
        const res = await axios.post(url, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });
        return res.data;
      });

      if (response && response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
        return response.candidates[0].content.parts[0].text;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : 'All Gemini model endpoints failed.');
}

function parseAiPitchJson(rawText, leadName) {
  if (!rawText) return null;

  // Clean markdown block wrappers
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. Standard JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && (parsed.emailBody || parsed.subject)) {
      return {
        subject: parsed.subject || `Custom Engineering & Systems for ${leadName}`,
        emailBody: String(parsed.emailBody).replace(/\\n/g, '\n'),
        whatsappIntro: parsed.whatsappIntro || `Hi ${leadName}, saw your site and noticed opportunities for custom automation.`,
        portfolioKeys: Array.isArray(parsed.portfolioKeys) ? parsed.portfolioKeys : []
      };
    }
  } catch (_) {}

  // 2. Robust Regex extraction if JSON.parse fails due to unescaped newlines inside AI response
  const subjectMatch = cleaned.match(/"subject"\s*:\s*"([^"]+)"/);
  const emailBodyMatch = cleaned.match(/"emailBody"\s*:\s*"([\s\S]*?)"\s*,\s*"whatsappIntro"/);
  const waMatch = cleaned.match(/"whatsappIntro"\s*:\s*"([^"]+)"/);
  const portfolioMatch = cleaned.match(/"portfolioKeys"\s*:\s*\[([^\]]+)\]/);

  if (emailBodyMatch && emailBodyMatch[1]) {
    const cleanBody = emailBodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    const cleanSub = subjectMatch ? subjectMatch[1] : `Custom Engineering & Systems for ${leadName}`;
    const cleanWa = waMatch ? waMatch[1] : `Hi ${leadName}, saw your site and noticed opportunities for custom automation.`;
    let keys = [];
    if (portfolioMatch && portfolioMatch[1]) {
      keys = portfolioMatch[1].split(',').map(k => k.replace(/"/g, '').trim()).filter(Boolean);
    }

    return {
      subject: cleanSub,
      emailBody: cleanBody,
      whatsappIntro: cleanWa,
      portfolioKeys: keys
    };
  }

  return null;
}

/**
 * Generates personalized email pitch and WhatsApp intro for a given lead
 */
async function generatePitchForLead(lead, customPromptTemplate = null) {
  const settings = getSettings();
  const template = customPromptTemplate || settings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;

  const filledPrompt = template
    .replace('{{clientName}}', lead.name || 'Business Owner')
    .replace('{{category}}', lead.category || 'Custom Software')
    .replace('{{website}}', lead.website || 'N/A')
    .replace('{{region}}', lead.region || 'Global')
    .replace('{{siteSummary}}', lead.siteSummary || 'Digital presence active');

  try {
    const rawAiOutput = await callGemini(filledPrompt);
    const parsedPitch = parseAiPitchJson(rawAiOutput, lead.name);

    if (parsedPitch && parsedPitch.emailBody) {
      return parsedPitch;
    }

    return generateFallbackPitch(lead);
  } catch (err) {
    console.warn(`[AI Generator Fallback] ${err.message}. Generating dynamic custom pitch.`);
    return generateFallbackPitch(lead);
  }
}

/**
 * Dynamic Lead-Specific Pitch Generator
 * Crafts custom tailored pitches based on lead domain, category, location, and site notes
 */
function generateFallbackPitch(lead) {
  const clientName = lead.name || 'Team';
  const category = lead.category || 'Custom App';
  const region = lead.region || 'your region';
  const website = lead.website || '';
  const siteNotes = lead.siteSummary || '';

  // Extract clean domain name if website is present
  let domainName = '';
  try {
    if (website) domainName = new URL(website).hostname.replace('www.', '');
  } catch (_) {}

  // Tailored subject line variations
  const subjects = [
    `Custom Software & Mobile App Architecture for ${clientName}`,
    `Streamlining ${clientName}'s Digital Workflows (${region})`,
    `Tailored App Development & Automation for ${clientName}`,
    `Engineering Custom Business Systems for ${clientName}`
  ];
  // Deterministic index selection based on lead name length to maintain consistency per lead
  const subIndex = (clientName.length + (website.length || 5)) % subjects.length;
  const selectedSubject = subjects[subIndex];

  // Specific service pitch angle based on lead category & site signals
  let specificPitchOffer = '';
  if (category === 'LMS') {
    specificPitchOffer = `We specialize in building custom learning portals, student management dashboards, course delivery systems, and automated grading modules tailored specifically to ${clientName}'s workflow requirements.`;
  } else if (category === 'ERP') {
    specificPitchOffer = `We engineer custom internal tools, inventory tracking systems, automated billing dashboards, and role-based staff portals built to streamline operations for ${clientName}.`;
  } else if (category === 'AI') {
    specificPitchOffer = `We build custom AI workflow automation engines, intelligent customer support bots, automated document extractors, and LLM-powered business assistants tailored for ${clientName}.`;
  } else if (category === 'Firmware') {
    specificPitchOffer = `We develop custom IoT telemetry dashboards, embedded firmware integrations, real-time sensor monitors, and hardware-software communication systems for ${clientName}.`;
  } else {
    // CustomApps & Web/Mobile Apps
    specificPitchOffer = `We build custom web & mobile applications (iOS/Android) and tailored client portals designed to solve ${clientName}'s specific operational requirements and customer touchpoints.`;
  }

  const websiteMention = domainName ? ` After reviewing ${domainName} (${siteNotes ? siteNotes.substring(0, 60) : 'digital setup'}), we identified several opportunities where custom automation can boost your operational efficiency.` : '';

  const emailBody = `Hi ${clientName},

I reached out regarding digital software infrastructure for businesses in ${region}.${websiteMention}

At Fusion Engine Technology, we don't build generic templates — we engineer fully customizable web and mobile applications tailored strictly to your specific business requirements.

${specificPitchOffer}

You can explore our technical portfolio and project case studies here:
• Portfolio: ${BRAND.portfolio}
• Website: ${BRAND.website}

Would you be open to a brief 10-minute technical discovery call this week to discuss building a custom solution for ${clientName}?

Direct WhatsApp: ${BRAND.whatsappLink}

Best regards,
Engineering Team
${BRAND.name}`;

  const whatsappIntro = `Hi ${clientName}, reached out from Fusion Engine (${BRAND.website}). We build custom web & mobile apps tailored strictly to your requirements. Would love to connect!`;

  return {
    subject: selectedSubject,
    emailBody,
    whatsappIntro
  };
}

/**
 * Generates a Fixed Price Scope of Work Proposal using Gemini
 */
async function generateProposal(clientName, projectScope, targetTech = []) {
  const prompt = `You are a Principal Solutions Architect at Fusion Engine Technology (fusionengine.in).
Generate a professional, structured, Fixed-Price Scope of Work (SOW) Software Proposal for:

Client Name: ${clientName}
Project Scope Description: ${projectScope}
Tech Stack / Services: ${targetTech.join(', ') || 'Full Stack Node.js, Custom Web & Mobile Apps, Database, AI Automation'}

Agency Links to include:
- Website: ${BRAND.website}
- Technical Portfolio: ${BRAND.portfolio}
- Contact / WhatsApp: ${BRAND.whatsappLink}

Format the response in clean Markdown with:
1. Executive Summary & Core Objectives
2. Detailed System Modules & Features
3. Technology Architecture & Security
4. Project Milestones, Timeline, & Fixed Investment Estimate
5. Next Steps & Direct WhatsApp Activation link (${BRAND.whatsappLink})`;

  try {
    const sow = await callGemini(prompt);
    return sow;
  } catch (err) {
    console.warn(`[Proposal AI Fallback] ${err.message}. Using standard proposal template.`);
    return generateFallbackProposal(clientName, projectScope, targetTech);
  }
}

function generateFallbackProposal(clientName, projectScope, targetTech) {
  return `# Fixed-Price Scope of Work (SOW) Proposal

**Prepared For:** ${clientName}  
**Prepared By:** Fusion Engine Technology (${BRAND.website})  
**Portfolio:** ${BRAND.portfolio}  
**Direct Contact:** ${BRAND.email} | WhatsApp: ${BRAND.whatsappLink}  

---

## 1. Executive Summary
Fusion Engine Technology proposes to design, engineer, test, and deploy a custom solution for **${clientName}**.  
**Core Objective:** ${projectScope}

## 2. Recommended Tech Stack
${targetTech.map(t => `- ${t}`).join('\n') || '- Custom Web & Mobile Applications (Node.js / React / Flutter)\n- Cloud Infrastructure & Secure Database Architecture\n- AI Workflow Automations & RESTful APIs'}

## 3. Scope Breakdown & Key Modules
- **Module A: Authentication & Role-Based Access Control** (Multi-tenant security)
- **Module B: Core Workflow Engine & Dashboard** (${projectScope})
- **Module C: Analytics, Reporting & Export Engine**
- **Module D: Automated Notifications (Email & SMS/WhatsApp Integration)**

## 4. Delivery Milestones & Investment

| Milestone | Deliverable | Estimated Timeline | Investment |
|---|---|---|---|
| Phase 1 | UI/UX Architecture & Database Design | Week 1 - 2 | Included |
| Phase 2 | Core System Engineering & API Integrations | Week 3 - 5 | Included |
| Phase 3 | QA Testing, Security Audit & User Acceptance | Week 6 | Included |
| Phase 4 | Production Deployment & 60-Day Technical Support | Post-Launch | Included |

## 5. Next Steps
To confirm this Scope of Work and kick off architecture design:
1. Click to connect directly on WhatsApp: [Chat on WhatsApp](${BRAND.whatsappLink})
2. Email approval to: ${BRAND.email}
`;
}

/**
 * Generates follow-up email pitches (Wireframe, Case Study, Breakup)
 */
async function generateFollowUpForLead(lead, followUpType) {
  const clientName = lead.name || 'Team';
  let angle = '';
  
  if (followUpType === 'wireframe') {
    angle = 'Offer to sketch out a free technical wireframe or architecture diagram showing exactly how we would solve their operational bottlenecks.';
  } else if (followUpType === 'casestudy') {
    angle = 'Share a brief, relevant technical success story of a similar project we built, focusing on speed and ROI.';
  } else if (followUpType === 'breakup') {
    angle = 'This is the final breakup email. Politely let them know we are closing their file for now, but leave the door open for future custom engineering needs.';
  } else {
    angle = 'Follow up on the previous email and ask if they have 5 minutes to chat this week.';
  }

  const prompt = `You are a Technical B2B Outreach Specialist for Fusion Engine Technology (fusionengine.in).
Write a brief, high-converting FOLLOW-UP email to this prospect.

Client Name: ${clientName}
Industry: ${lead.category || 'Software'}
Follow-Up Strategy: ${angle}

Rules:
1. Tone: Professional, direct, no fluff.
2. Reference that we previously reached out.
3. VERY IMPORTANT: Structure the main body as a short numbered list (1., 2.) if offering ideas, or keep it to 2-3 short paragraphs.
4. End with a low-friction question to encourage a reply (e.g., 'Are you open to a 5-minute chat?').
5. Keep under 150 words.

Return JSON format with:
{
  "subject": "Follow-up subject line (can start with Re:)",
  "emailBody": "Full email text",
  "portfolioKeys": [] // Choose UP TO 2 relevant keys from: erp, lms, automation, apps. Return [] if none are highly relevant.
}`;

  try {
    const rawAiOutput = await callGemini(prompt);
    const parsedPitch = parseAiPitchJson(rawAiOutput, lead.name);

    if (parsedPitch && parsedPitch.emailBody) {
      return parsedPitch;
    }
  } catch (err) {
    console.warn(`[Follow-Up AI Fallback] ${err.message}.`);
  }

  // Fallback
  return {
    subject: `Re: Custom Engineering for ${clientName}`,
    emailBody: `Hi ${clientName},\n\nI'm following up on my previous note. We'd love to sketch out a free architecture diagram showing how custom software could streamline your operations.\n\nDo you have 5 minutes this week to connect?\n\nBest regards,\n${BRAND.name}`,
    portfolioKeys: []
  };
}

module.exports = {
  generatePitchForLead,
  generateFallbackPitch,
  generateFollowUpForLead,
  generateProposal,
  callGemini
};
