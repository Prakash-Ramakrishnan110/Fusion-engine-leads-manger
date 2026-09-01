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
      'Custom Mobile & Web Applications Tailored to Any Business Requirement',
      'Custom ERP Systems & Internal Business Tools',
      'LMS Platforms & Educational Portals',
      'SaaS Web & Mobile Apps (iOS/Android)',
      'AI Workflow Automation & Intelligent Chatbots',
      'Firmware & IoT Hardware Engineering'
    ]
  },

  PORTFOLIO_ITEMS: {
    erp: {
      title: 'Custom ERP & Inventory System',
      description: 'Automated inventory tracking and role-based staff portals built to streamline daily operations.',
      image: 'assets/erp_dashboard.png'
    },
    lms: {
      title: 'Enterprise Learning Management System',
      description: 'Custom student dashboards, course delivery, and automated grading modules.',
      image: 'assets/lms_portal.png'
    },
    automation: {
      title: 'AI Workflow Automation Engine',
      description: 'Intelligent bots and automated document extractors that eliminate manual data entry.',
      image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800'
    },
    apps: {
      title: 'Custom Web & Mobile Application',
      description: 'Native and cross-platform apps designed for specific operational requirements and scalability.',
      image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=800'
    }
  },

  TARGET_CATEGORIES: [
    { id: 'CustomApps', name: 'Custom Business Apps (Tailored Requirements)', keywords: ['business', 'software', 'service', 'portal', 'management', 'custom', 'app', 'solutions', 'platform'] },
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
    { touch: 2, dayOffset: 1, type: 'wireframe', title: 'Day 1 Follow-up: Free Wireframe Offer' },
    { touch: 3, dayOffset: 3, type: 'casestudy', title: 'Day 3 Follow-up: Relevant Case Study' },
    { touch: 4, dayOffset: 7, type: 'breakup', title: 'Day 7 Follow-up: Final Breakup Email' }
  ],

  DEFAULT_PROMPT_TEMPLATE: `You are a top-tier Technical B2B Outreach Specialist representing Fusion Engine Technology (fusionengine.in).
We specialize in building Fully Customizable Web & Mobile Applications tailored strictly to any client business requirements (Custom ERPs, LMS portals, SaaS Apps, AI Automation, and IoT).

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
2. Emphasize that we build custom web/mobile apps tailored 100% to their specific operational requirements and workflow needs.
3. VERY IMPORTANT: Structure the main body of your email as a short numbered list (1., 2., 3.) pointing out specific custom improvements or observations based on their site/industry. This fits our email template design perfectly.
4. Always end the email with a low-friction question (e.g., 'Are you available for a brief 5-minute chat next Tuesday?') to encourage a direct email reply.
5. Keep email under 200 words.

Return JSON format with:
{
  "subject": "Concise high-converting subject line",
  "emailBody": "Full email text ending with a direct reply question",
  "whatsappIntro": "Short 2-sentence intro message pre-formatted for click-to-chat",
  "portfolioKeys": ["erp"] // Choose UP TO 2 keys from: erp, lms, automation, apps that are HIGHLY RELEVANT to their industry. Return [] if none are a great match.
}`
};
