/**
 * Fusion Engine Technology — 24/7 Client Acquisition Engine Server
 * 
 * Express API + node-cron Orchestrator
 * Bound strictly to localhost (127.0.0.1:3000) for local security
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { BRAND } = require('./config');
const {
  getLeads, saveLeads, saveLead,
  getOptOuts, addOptOut, removeOptOut,
  getMessageLogs, getSystemLogs, appendSystemLog,
  getSettings, updateSettings
} = require('./data/db');

const { runLeadScraper } = require('./src/scrapers/leadScraper');
const { scoreLead } = require('./src/ml/leadScorer');
const { generatePitchForLead, generateProposal } = require('./src/ai/auditorAndWriter');
const { generateClickToChatLink } = require('./src/outreach/whatsappDispatcher');
const { sendOutreachEmail, verifyUnsubscribeToken } = require('./src/outreach/emailDispatcher');
const { registerOptOut, unregisterOptOut } = require('./src/outreach/optOutManager');
const { initializeWhatsAppBot, processInboundReply } = require('./src/bot/replyHandler');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || process.env.PORT_API || '3000', 10);
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'fusion2026';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 1. PUBLIC ENDPOINTS (No Auth Token Required) ---
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    appendSystemLog('INFO', 'Dashboard login session authenticated successfully.');
    return res.json({ success: true, token: PASSWORD });
  }
  return res.status(401).json({ error: 'Incorrect dashboard password.' });
});

app.get('/api/unsubscribe', async (req, res) => {
  const { email, token } = req.query;

  if (!email || !token) {
    return res.status(400).send('<html><body style="font-family:sans-serif; padding:40px; text-align:center;"><h2>Invalid Request</h2><p>Missing email or validation token.</p></body></html>');
  }

  const isValid = verifyUnsubscribeToken(email, token);
  if (!isValid) {
    return res.status(403).send('<html><body style="font-family:sans-serif; padding:40px; text-align:center;"><h2>Access Denied</h2><p>Invalid or expired unsubscribe link security token.</p></body></html>');
  }

  registerOptOut(email);
  appendSystemLog('INFO', `Opted out email via HMAC signed link: ${email}`);

  res.send(`
    <html>
      <head><title>Unsubscribed — ${BRAND.name}</title></head>
      <body style="font-family:sans-serif; background:#F8FAFC; color:#0F172A; padding:60px 20px; text-align:center;">
        <div style="max-width:500px; margin:0 auto; background:#FFF; border-radius:12px; padding:32px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color:#2563EB; margin-top:0;">Successfully Unsubscribed</h2>
          <p>The email address <strong>${email}</strong> has been permanently removed from Fusion Engine Technology's outreach list.</p>
          <p style="font-size:13px; color:#64748B;">You will receive no further outreach communications from our team.</p>
        </div>
      </body>
    </html>
  `);
});

// --- 2. AUTHENTICATION MIDDLEWARE FOR PROTECTED /api/* ROUTES ---
app.use('/api', (req, res, next) => {
  const token = req.headers['x-dashboard-auth'] || req.query.auth;
  if (!token || token !== PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid dashboard password pin.' });
  }
  next();
});

// --- 3. PROTECTED SYSTEM STATS ---
app.get('/api/stats', (req, res) => {
  const leads = getLeads();
  const logs = getMessageLogs();
  const settings = getSettings();

  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => l.score >= 85).length;
  const emailsSent = logs.filter(m => m.type === 'EMAIL_DISPATCH').length;
  const replies = logs.filter(m => m.type && m.type.includes('INBOUND_REPLY')).length;
  const waClicks = leads.filter(l => l.waClickCount && l.waClickCount > 0).length;

  const pipelineValue = leads
    .filter(l => l.status !== 'Opted Out')
    .reduce((sum, l) => sum + (l.estimatedValue || 2500), 0);

  res.json({
    botActive: settings.botActive,
    totalLeads,
    hotLeads,
    waClicks,
    emailsSent,
    replies,
    pipelineValue,
    coldEmailEnabled: settings.coldEmailEnabled
  });
});

// --- 4. LEADS CRM ENDPOINTS ---
app.get('/api/leads', (req, res) => {
  const { category, scoreTier, search } = req.query;
  let leads = getLeads();

  if (category && category !== 'ALL') {
    leads = leads.filter(l => l.category === category);
  }
  if (scoreTier && scoreTier !== 'ALL') {
    leads = leads.filter(l => l.tier === scoreTier);
  }
  if (search) {
    const q = search.toLowerCase();
    leads = leads.filter(l => (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q) || (l.website || '').toLowerCase().includes(q));
  }

  // Sort leads newest first so newly discovered candidates appear at top
  leads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  res.json({ leads });
});

app.post('/api/leads/manual', async (req, res) => {
  const { name, website, email, phone, category, region } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const rawCandidate = { name, website, email, phone, category: category || 'Apps', region: region || 'Global' };
  const scoring = scoreLead(rawCandidate);

  const newLead = {
    id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name,
    website: website || '',
    email: email || '',
    phone: phone || '',
    category: category || 'Apps',
    region: region || 'Global',
    score: scoring.score,
    tier: scoring.tier,
    estimatedValue: scoring.estimatedValue,
    scoreBreakdown: scoring.breakdown,
    status: 'Discovered',
    touchCount: 0,
    createdAt: new Date().toISOString()
  };

  await saveLead(newLead);
  appendSystemLog('INFO', `Manually added lead: "${newLead.name}" (${newLead.tier} - ${newLead.score}%)`);
  res.json({ success: true, lead: newLead });
});

app.post('/api/leads/:id/pitch', async (req, res) => {
  const { id } = req.params;
  const leads = getLeads();
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  try {
    const pitch = await generatePitchForLead(lead);
    lead.pitchSubject = pitch.subject;
    lead.pitchBody = pitch.emailBody;
    lead.whatsappIntro = pitch.whatsappIntro;
    
    await saveLead(lead);
    res.json({ success: true, pitch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/email', async (req, res) => {
  const { id } = req.params;
  const { subject, body } = req.body;
  const leads = getLeads();
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const result = await sendOutreachEmail(lead, subject, body);
  if (result.success) {
    lead.status = 'Pitched';
    lead.touchCount = (lead.touchCount || 0) + 1;
    lead.lastTouchAt = new Date().toISOString();
    await saveLead(lead);
  }

  res.json(result);
});

app.get('/api/leads/:id/whatsapp', (req, res) => {
  const { id } = req.params;
  const leads = getLeads();
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const waResult = generateClickToChatLink(lead);
  if (waResult.allowed) {
    lead.waClickCount = (lead.waClickCount || 0) + 1;
    saveLead(lead);
  }

  res.json(waResult);
});

app.post('/api/leads/clear', async (req, res) => {
  await saveLeads([]);
  await saveMessageLogs([]);
  appendSystemLog('INFO', 'Pipeline CRM reset. All old leads cleared.');
  res.json({ success: true, message: 'Pipeline cleared successfully.' });
});

app.post('/api/leads/:id/optout', async (req, res) => {
  const { id } = req.params;
  const leads = getLeads();
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  lead.optedOut = !lead.optedOut;
  lead.status = lead.optedOut ? 'Opted Out' : 'Discovered';

  if (lead.optedOut) {
    if (lead.email) registerOptOut(lead.email);
    if (lead.phone) registerOptOut(lead.phone);
    if (lead.website) registerOptOut(lead.website);
  } else {
    if (lead.email) unregisterOptOut(lead.email);
    if (lead.phone) unregisterOptOut(lead.phone);
  }

  await saveLead(lead);
  appendSystemLog('INFO', `Toggled Opt-Out status for lead "${lead.name}" to ${lead.optedOut}`);
  res.json({ success: true, lead });
});

// --- 5. SOURCING & SCRAPING ENDPOINTS ---
app.post('/api/scrape/trigger', async (req, res) => {
  const { category, region } = req.body;
  
  runLeadScraper(category || 'LMS', region || 'India').catch(err => {
    appendSystemLog('ERROR', `Scraper run error: ${err.message}`);
  });

  res.json({ success: true, message: `Scraper launched for ${category} in ${region}. Watch Live Terminal Logs.` });
});

app.get('/api/logs', (req, res) => {
  const logs = getSystemLogs();
  res.json({ logs: logs.slice(-200) });
});

// --- 6. PROPOSAL GENERATOR ---
app.post('/api/proposals/generate', async (req, res) => {
  const { clientName, projectScope, targetTech } = req.body;
  if (!clientName || !projectScope) {
    return res.status(400).json({ error: 'clientName and projectScope are required.' });
  }

  try {
    const proposalMarkdown = await generateProposal(clientName, projectScope, targetTech || []);
    appendSystemLog('INFO', `Generated proposal for client "${clientName}"`);
    res.json({ success: true, proposal: proposalMarkdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 7. OPT OUT LIST MANAGERS ---
app.get('/api/optouts', (req, res) => {
  res.json({ optOuts: getOptOuts() });
});

app.post('/api/optouts', async (req, res) => {
  const { identifier } = req.body;
  if (identifier) {
    registerOptOut(identifier);
    res.json({ success: true, optOuts: getOptOuts() });
  } else {
    res.status(400).json({ error: 'Identifier is required.' });
  }
});

app.delete('/api/optouts', async (req, res) => {
  const { identifier } = req.body;
  if (identifier) {
    unregisterOptOut(identifier);
    res.json({ success: true, optOuts: getOptOuts() });
  } else {
    res.status(400).json({ error: 'Identifier is required.' });
  }
});

// --- 8. SETTINGS & BOT CONTROL ---
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  res.json({ settings });
});

app.post('/api/settings', async (req, res) => {
  const updates = req.body;
  await updateSettings(updates);
  appendSystemLog('INFO', 'Updated system configuration settings.');
  res.json({ success: true, settings: getSettings() });
});

app.post('/api/bot/status', async (req, res) => {
  const { active } = req.body;
  await updateSettings({ botActive: !!active });
  const statusStr = active ? '🟢 BOT ONLINE' : '🔴 BOT PAUSED';
  appendSystemLog('INFO', `Bot Status Changed: ${statusStr}`);
  res.json({ success: true, botActive: !!active });
});

// --- 9. 24/7 CRON ORCHESTRATION ENGINE (EVERY 15 MINUTES) ---
cron.schedule('*/15 * * * *', async () => {
  const settings = getSettings();
  if (!settings.botActive) {
    console.log('[24/7 Engine] Cron trigger skipped — Bot is currently PAUSED.');
    return;
  }

  appendSystemLog('INFO', '⚡ 24/7 Cron Engine triggered: Performing automated lead discovery & follow-up touches...');

  try {
    const categories = ['LMS', 'ERP', 'Apps', 'AI', 'Firmware'];
    const regions = ['India', 'USA', 'Europe', 'Middle East'];
    const randomCat = categories[Math.floor(Math.random() * categories.length)];
    const randomReg = regions[Math.floor(Math.random() * regions.length)];

    await runLeadScraper(randomCat, randomReg);

    const leads = getLeads();
    const now = Date.now();

    for (const lead of leads) {
      if (lead.optedOut || lead.status === 'Opted Out' || !lead.email) continue;

      const createdAgeDays = (now - new Date(lead.createdAt || now).getTime()) / (1000 * 60 * 60 * 24);
      const touchCount = lead.touchCount || 0;

      if (touchCount === 0) {
        appendSystemLog('INFO', `⚡ [Cron Auto-Outreach] Executing Touch 1 (Pitch) for lead "${lead.name}" (${lead.email})...`);
        const pitch = await generatePitchForLead(lead);
        const res = await sendOutreachEmail(lead, pitch.subject, pitch.emailBody);
        if (res.success) {
          lead.touchCount = 1;
          lead.status = 'Pitched';
          lead.lastTouchAt = new Date().toISOString();
          await saveLead(lead);
        }
      }
    }
  } catch (err) {
    appendSystemLog('ERROR', `24/7 Cron Engine error: ${err.message}`);
  }
});

function startApiServer(portToTry) {
  const server = app.listen(portToTry, '0.0.0.0', () => {
    appendSystemLog('INFO', `Fusion Engine REST API listening on http://0.0.0.0:${portToTry}`);
    console.log(`[API Server] Running on http://0.0.0.0:${portToTry}`);
    
    initializeWhatsAppBot().catch(_ => {});
  });

  server.on('error', (err) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      console.warn(`[API Server] Port ${portToTry} is restricted (${err.code}). Retrying on port ${portToTry + 1}...`);
      setTimeout(() => startApiServer(portToTry + 1), 200);
    } else {
      console.error('[API Server Error]', err);
    }
  });
}

startApiServer(PORT);
