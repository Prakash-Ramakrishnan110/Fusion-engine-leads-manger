/**
 * Brand Configuration for Fusion Engine Technology
 * ONLY brand metadata and defaults (NO SECRETS HERE)
 */

module.exports = {
  BRAND: {
    name: 'Fusion Engine Technology',
    website: 'https://fusionengine.in',
    portfolio: 'https://prakash-portfolio-alpha.vercel.app/',
    email: 'fusionenginetechnology@gmail.com',
    whatsappNumber: '+916369884331',
    whatsappClean: '916369884331',
    whatsappLink: 'https://wa.me/916369884331',
    address: 'Fusion Engine Technology, Tech Enclave, Phase 2, Software Corridor, India',
    services: [
      'Custom ERP Systems & Internal Tools',
      'LMS Platforms & Educational Portals',
      'SaaS Web & Mobile Applications (iOS/Android)',
      'AI Workflow Automation & Chatbots',
      'Firmware & IoT Engineering'
    ]
  },

  TARGET_CATEGORIES: [
    { id: 'LMS', name: 'LMS & Education', keywords: ['school', 'coaching', 'academy', 'learning', 'university', 'college', 'institute'] },
    { id: 'ERP', name: 'ERP & Business Systems', keywords: ['manufacturing', 'logistics', 'supply chain', 'warehouse', 'distributor', 'clinic', 'hospitality'] },
    { id: 'Apps', name: 'Web & Mobile Apps', keywords: ['startup', 'ecommerce', 'retail', 'booking', 'marketplace', 'fitness', 'real estate'] },
    { id: 'AI', name: 'AI & Automation', keywords: ['agency', 'customer support', 'law firm', 'accounting', 'finance', 'consulting'] },
    { id: 'Firmware', name: 'Firmware & IoT', keywords: ['hardware', 'automation', 'sensors', 'embedded', 'industrial', 'smart home'] }
  ],

  TARGET_REGIONS: [
    { id: 'India', name: 'India (Bangalore, Mumbai, Delhi, Chennai, Hyderabad)' },
    { id: 'USA', name: 'USA (California, New York, Texas, Florida)' },
    { id: 'Europe', name: 'Europe (UK, Germany, Netherlands, Nordic)' },
    { id: 'Middle East', name: 'Middle East (Dubai, UAE, Saudi Arabia, Qatar)' },
    { id: 'Global', name: 'Global / Remote First' }
  ],

  FOLLOWUP_SCHEDULE: [
    { touch: 1, dayOffset: 1, type: 'pitch', title: 'Day 1: Initial Pitch & Audit' },
    { touch: 2, dayOffset: 3, type: 'wireframe', title: 'Day 3: Free Wireframe & Architecture Offer' },
    { touch: 3, dayOffset: 7, type: 'casestudy', title: 'Day 7: Relevant Portfolio Case Study' },
    { touch: 4, dayOffset: 14, type: 'breakup', title: 'Day 14: Final Breakup Email' }
  ],

  DEFAULT_PROMPT_TEMPLATE: `You are a top-tier Technical B2B Outreach Specialist representing Fusion Engine Technology (fusionengine.in).
We specialize in Custom ERPs, LMS platforms, Web/Mobile Apps, AI Automation, and IoT/Firmware.

Write a high-converting, personalized cold pitch email for the prospective client below.

Client Name/Business: {{clientName}}
Industry/Category: {{category}}
Website: {{website}}
Location/Region: {{region}}
Site Quality Signal: {{siteSummary}}

Portfolio: https://prakash-portfolio-alpha.vercel.app/
WhatsApp: https://wa.me/916369884331

Rules:
1. Tone: Professional, direct, human, expert developer tone. No fluff, generic corporate buzzwords, or fake compliments.
2. Highlight 1-2 specific operational improvements we can build for them (e.g. custom workflow automation, LMS portal, or ERP dashboard).
3. Include clear Call to Action to reply to email or reach out on WhatsApp directly: https://wa.me/916369884331
4. Keep email under 170 words.

Return JSON format with:
{
  "subject": "Concise high-converting subject line",
  "emailBody": "Full email text",
  "whatsappIntro": "Short 2-sentence intro message pre-formatted for click-to-chat"
}`
};
