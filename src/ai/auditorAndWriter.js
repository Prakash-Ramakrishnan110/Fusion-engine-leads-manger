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
async function callGemini(promptText, apiKeyOverride = null) {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in .env or Settings.');
  }

  // Use Gemini 3.6 Flash model REST endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  const response = await geminiLimiter.enqueue(async () => {
    const res = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 25000
    });
    return res.data;
  });

  if (response && response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
    return response.candidates[0].content.parts[0].text;
  }

  throw new Error('Invalid or empty response from Gemini API.');
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
        whatsappIntro: parsed.whatsappIntro || `Hi ${leadName}, saw your site and noticed opportunities for custom automation.`
      };
    }
  } catch (_) {}

  // 2. Robust Regex extraction if JSON.parse fails due to unescaped newlines inside AI response
  const subjectMatch = cleaned.match(/"subject"\s*:\s*"([^"]+)"/);
  const emailBodyMatch = cleaned.match(/"emailBody"\s*:\s*"([\s\S]*?)"\s*,\s*"whatsappIntro"/);
  const waMatch = cleaned.match(/"whatsappIntro"\s*:\s*"([^"]+)"/);

  if (emailBodyMatch && emailBodyMatch[1]) {
    const cleanBody = emailBodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    const cleanSub = subjectMatch ? subjectMatch[1] : `Custom Engineering & Systems for ${leadName}`;
    const cleanWa = waMatch ? waMatch[1] : `Hi ${leadName}, saw your site and noticed opportunities for custom automation.`;
    return {
      subject: cleanSub,
      emailBody: cleanBody,
      whatsappIntro: cleanWa
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
    .replace('{{category}}', lead.category || 'Software')
    .replace('{{website}}', lead.website || 'N/A')
    .replace('{{region}}', lead.region || 'Global')
    .replace('{{siteSummary}}', lead.siteSummary || 'Digital presence active');

  try {
    const rawAiOutput = await callGemini(filledPrompt);
    const parsedPitch = parseAiPitchJson(rawAiOutput, lead.name);

    if (parsedPitch && parsedPitch.emailBody) {
      return parsedPitch;
    }

    // Fallback to rule-based template if AI output was not clean JSON (never send raw JSON tags)
    return generateFallbackPitch(lead);
  } catch (err) {
    console.warn(`[AI Generator Fallback] ${err.message}. Using rule-based fallback pitch.`);
    return generateFallbackPitch(lead);
  }
}

function generateFallbackPitch(lead) {
  const clientName = lead.name || 'Team';
  const category = lead.category || 'Web App';
  
  return {
    subject: `Scaling ${clientName}'s Digital Stack — Fusion Engine Technology`,
    emailBody: `Hi ${clientName},\n\nI was looking into ${category} workflows for businesses in ${lead.region || 'your industry'} and reached out to see how your current digital setup is performing.\n\nAt Fusion Engine Technology, we design and build custom ERP systems, LMS platforms, web/mobile applications, and AI workflow automations tailored specifically for scaling operations.\n\nYou can review our client case studies and technical work here:\nPortfolio: ${BRAND.portfolio}\nWebsite: ${BRAND.website}\n\nWould you be open to a brief 10-minute discovery chat this week to explore building a custom platform for ${clientName}?\n\nDirect WhatsApp: ${BRAND.whatsappLink}\n\nBest regards,\nEngineering Team\n${BRAND.name}`,
    whatsappIntro: `Hi ${clientName}, reached out from Fusion Engine (${BRAND.website}). We specialize in building custom ${category} systems and mobile apps.`
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

module.exports = {
  generatePitchForLead,
  generateProposal,
  callGemini
};
