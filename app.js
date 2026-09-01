/**
 * Fusion Engine Technology — SPA Frontend Client Logic
 */

const API_HOST = window.location.hostname || '127.0.0.1';
let API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// Auto-discover active API port if running locally and port shifted
async function discoverApiBase() {
  if (API_HOST !== '127.0.0.1' && API_HOST !== 'localhost') {
    API_BASE = `${window.location.protocol}//${window.location.host}/api`;
    return;
  }
  // Try current host first
  try {
    const currentRes = await fetch(`${window.location.protocol}//${window.location.host}/api/stats`, {
      headers: { 'X-Dashboard-Auth': authToken }
    });
    if (currentRes.ok || currentRes.status === 401) {
      API_BASE = `${window.location.protocol}//${window.location.host}/api`;
      return;
    }
  } catch (_) {}

  // Port probing order for backend server.js
  const ports = [3000, 3001, 3002, 3005];
  for (const p of ports) {
    try {
      const res = await fetch(`http://${API_HOST}:${p}/api/stats`, {
        headers: { 'X-Dashboard-Auth': authToken }
      });
      if (res.ok || res.status === 401) {
        API_BASE = `http://${API_HOST}:${p}/api`;
        break;
      }
    } catch (_) { }
  }
}
let authToken = localStorage.getItem('FE_AUTH_TOKEN') || '';
let currentLeads = [];
let activePitchLeadId = null;
let currentBotActive = true;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  await ensureAuthenticated();
});

async function ensureAuthenticated() {
  await discoverApiBase();

  // 1. Try existing stored auth token
  if (authToken) {
    try {
      const res = await fetch(`${API_BASE}/stats`, { headers: apiHeaders() });
      if (res.ok) {
        document.getElementById('authGate').style.display = 'none';
        initDashboard();
        return;
      }
    } catch (_) {}
  }

  // 2. Auto-login using default PIN 'fusion2026' so password prompt is bypassed
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'fusion2026' })
    });
    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem('FE_AUTH_TOKEN', authToken);
      document.getElementById('authGate').style.display = 'none';
      initDashboard();
      return;
    }
  } catch (_) {}

  // 3. Fallback to authGate if custom password was set
  const authInput = document.getElementById('authPassword');
  if (authInput && !authInput.value) {
    authInput.value = 'fusion2026';
  }
  document.getElementById('authGate').style.display = 'flex';
}

// --- AUTHENTICATION ---
async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  await discoverApiBase();

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      localStorage.setItem('FE_AUTH_TOKEN', authToken);
      document.getElementById('authGate').style.display = 'none';
      initDashboard();
    } else {
      errorEl.textContent = data.error || 'Authentication failed.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Unable to connect to backend server. Make sure node server.js is running.';
    errorEl.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('FE_AUTH_TOKEN');
  authToken = '';
  document.getElementById('authGate').style.display = 'flex';
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Dashboard-Auth': authToken
  };
}

// --- DASHBOARD INIT & METRICS ---
async function initDashboard() {
  await discoverApiBase();
  fetchMetrics();
  loadLeads();
  fetchLogs();
  loadOptOuts();
  loadSettings();

  // Poll metrics, leads CRM table, and logs every 5 seconds
  setInterval(() => {
    fetchMetrics();
    loadLeads();
  }, 5000);
  setInterval(fetchLogs, 5000);
}

async function fetchMetrics() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/stats`, { headers: apiHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    document.getElementById('metricLeads').textContent = data.totalLeads || 0;
    document.getElementById('metricHotLeads').textContent = data.hotLeads || 0;
    const opensEl = document.getElementById('metricOpens');
    if(opensEl) opensEl.textContent = data.totalOpens || 0;
    document.getElementById('metricEmailsSent').textContent = data.emailsSent || 0;
    document.getElementById('metricReplies').textContent = data.replies || 0;
    document.getElementById('metricPipeline').textContent = `$${(data.pipelineValue || 0).toLocaleString()}`;

    // Update Bot Status Pill & Sourcing Toggle
    const pill = document.getElementById('botStatusPill');
    const text = document.getElementById('botStatusText');
    const sPill = document.getElementById('sourcingAutomationToggle');
    const sText = document.getElementById('sourcingAutomationText');

    currentBotActive = !!data.botActive;
    if (data.botActive) {
      if (pill) pill.className = 'status-pill online';
      if (text) text.textContent = '🟢 AUTOMATION: ON';
      if (sPill) sPill.className = 'status-pill online';
      if (sText) sText.textContent = '🟢 AUTOMATION: ON';
    } else {
      if (pill) pill.className = 'status-pill paused';
      if (text) text.textContent = '🔴 AUTOMATION: OFF';
      if (sPill) sPill.className = 'status-pill paused';
      if (sText) sText.textContent = '🔴 AUTOMATION: OFF';
    }
  } catch (_) { }
}

async function toggleBotStatus() {
  const newActive = !currentBotActive;

  try {
    const res = await fetch(`${API_BASE}/bot/status`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ active: newActive })
    });
    const data = await res.json();
    if (data.success) {
      currentBotActive = !!data.botActive;
      fetchMetrics();
      fetchLogs();
    }
  } catch (err) {
    alert('Failed to toggle Master Automation status.');
  }
}

// --- TAB SWITCHING ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  event.currentTarget.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// --- TAB 1: LEAD PIPELINE CRM ---
async function loadLeads() {
  if (!authToken) return;
  const category = document.getElementById('filterCategory').value;
  const scoreTier = document.getElementById('filterScore').value;
  const search = document.getElementById('filterSearch').value;

  const query = new URLSearchParams({ category, scoreTier, search });

  try {
    const res = await fetch(`${API_BASE}/leads?${query.toString()}`, { headers: apiHeaders() });
    const data = await res.json();
    currentLeads = data.leads || [];
    renderLeadsKanban(currentLeads);
  } catch (err) {
    console.error('Failed to load leads:', err);
  }
}

function renderLeadsKanban(leads) {
  const container = document.getElementById('leadsKanbanBoard');
  if (!leads || leads.length === 0) {
    container.innerHTML = `<div style="padding: 24px; color: var(--text-muted); width: 100%; text-align: center;">No prospective leads found. Launch a scraper or add manually.</div>`;
    renderAnalyticsCharts([]);
    return;
  }

  const columns = {
    'Discovered': { title: 'Discovered', leads: [] },
    'Pitched': { title: 'Pitched (Touch 1)', leads: [] },
    'Follow-Up': { title: 'Follow-Up Sequence', leads: [] },
    'Opened': { title: 'Opened / Reading', leads: [] },
    'Replied': { title: 'Replied / Hot', leads: [] },
    'Opted Out': { title: 'Opted Out', leads: [] }
  };

  leads.forEach(l => {
    let statusCol = l.status || 'Discovered';
    if (statusCol.startsWith('Follow-Up')) statusCol = 'Follow-Up';
    if (!columns[statusCol]) statusCol = 'Discovered'; // Fallback
    columns[statusCol].leads.push(l);
  });

  let html = '';
  for (const [key, col] of Object.entries(columns)) {
    // Skip empty columns except the main ones
    if (col.leads.length === 0 && key === 'Opted Out') continue;
    
    html += `<div class="kanban-col">
      <div class="kanban-col-header">
        <span>${col.title}</span>
        <span class="badge" style="background:var(--bg-card-solid); color:var(--text-main);">${col.leads.length}</span>
      </div>
      <div class="kanban-col-body">`;
      
    col.leads.forEach(l => {
      let badgeClass = 'badge-cold';
      if (l.tier === 'Hot') badgeClass = 'badge-hot';
      else if (l.tier === 'Warm') badgeClass = 'badge-warm';

      const waEncodedMsg = encodeURIComponent(l.whatsappIntro || `Hi ${l.name}, reached out from Fusion Engine Technology (${l.website || 'fusionengine.in'}). We build custom ${l.category || 'software'} platforms.`);
      const waLink = `https://wa.me/916369884331?text=${waEncodedMsg}`;

      const discoveredTime = l.createdAt
        ? new Date(l.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric' })
        : 'Recently';

      html += `
        <div class="kanban-card">
          <h4>${escapeHtml(l.name)}</h4>
          <a href="${l.website}" target="_blank" class="domain">${l.website || 'No website'}</a>
          <div class="details">
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <span class="badge ${badgeClass}">${l.score}% ${l.tier}</span>
              <span class="badge badge-category">${l.category}</span>
            </div>
            <div style="color: var(--text-muted); font-size: 13px;">
              ${l.email ? `✉️ ${escapeHtml(l.email)}` : 'No Email'}
            </div>
            ${l.openCount ? `<div style="color:var(--status-green); margin-top:4px; font-weight:600;">👁️ Opened ${l.openCount}x</div>` : ''}
          </div>
          <div class="actions">
            <button class="btn btn-sm btn-success" style="flex:1;" onclick="handleWaDispatch('${l.id}')">💬 WA</button>
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="openPitchModal('${l.id}')">✉️ Pitch</button>
            <button class="btn btn-sm ${l.optedOut ? 'btn-danger' : 'btn-secondary'}" style="flex:1;" onclick="toggleOptOut('${l.id}')">${l.optedOut ? 'Unblock' : 'Block'}</button>
          </div>
        </div>
      `;
    });
    
    html += `</div></div>`;
  }
  
  container.innerHTML = html;
  
  // Render advanced charts
  renderAnalyticsCharts(leads);
}

// --- ANALYTICS CHARTS (PHASE 3) ---
let funnelChartInstance = null;
let statusChartInstance = null;

function renderAnalyticsCharts(leads) {
  if (typeof Chart === 'undefined') return; // Wait for CDN

  const ctxFunnel = document.getElementById('funnelChart');
  const ctxStatus = document.getElementById('statusChart');
  
  if (!ctxFunnel || !ctxStatus) return;

  // Aggregate Data
  const stats = {
    discovered: leads.length,
    pitched: leads.filter(l => l.status !== 'Discovered' && !l.optedOut).length,
    followUp: leads.filter(l => l.touchCount > 1 && !l.optedOut).length,
    engaged: leads.filter(l => ['Opened', 'Replied'].includes(l.status)).length
  };

  const statusCounts = {
    'Discovered': leads.filter(l => l.status === 'Discovered').length,
    'Pitched': leads.filter(l => l.status === 'Pitched' || l.status === 'Follow-Up').length,
    'Opened': leads.filter(l => l.status === 'Opened').length,
    'Replied': leads.filter(l => l.status === 'Replied').length,
    'Opted Out': leads.filter(l => l.optedOut).length
  };

  // Funnel Chart
  if (funnelChartInstance) funnelChartInstance.destroy();
  funnelChartInstance = new Chart(ctxFunnel, {
    type: 'bar',
    data: {
      labels: ['Discovered', 'Pitched (Touch 1)', 'Follow-Up', 'Engaged (Opened/Replied)'],
      datasets: [{
        label: 'Lead Pipeline Funnel',
        data: [stats.discovered, stats.pitched, stats.followUp, stats.engaged],
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(139, 92, 246, 0.7)',
          'rgba(245, 158, 11, 0.7)',
          'rgba(16, 185, 129, 0.7)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(139, 92, 246)',
          'rgb(245, 158, 11)',
          'rgb(16, 185, 129)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Acquisition Pipeline Drop-off', color: '#475569' }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#475569' } },
        x: { grid: { display: false }, ticks: { color: '#475569' } }
      }
    }
  });

  // Status Distribution Doughnut
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: [
          'rgba(148, 163, 184, 0.9)', // Discovered
          'rgba(59, 130, 246, 0.9)', // Pitched
          'rgba(245, 158, 11, 0.9)', // Opened
          'rgba(16, 185, 129, 0.9)', // Replied
          'rgba(239, 68, 68, 0.9)'   // Opted Out
        ],
        borderColor: '#FFFFFF',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#475569' } },
        title: { display: true, text: 'Total CRM Status Distribution', color: '#475569' }
      }
    }
  });
}

async function trackWaClick(leadId) {
  try {
    await fetch(`${API_BASE}/leads/${leadId}/whatsapp`, { headers: apiHeaders() });
    setTimeout(fetchMetrics, 1000);
  } catch (_) { }
}

async function toggleOptOut(leadId) {
  try {
    await fetch(`${API_BASE}/leads/${leadId}/optout`, {
      method: 'POST',
      headers: apiHeaders()
    });
    loadLeads();
    loadOptOuts();
  } catch (err) {
    alert('Failed to toggle opt-out.');
  }
}

async function clearPipelineData() {
  if (!confirm('Are you sure you want to clear all leads and reset the pipeline? This will remove existing candidates so new leads can be scraped fresh.')) return;
  try {
    const res = await fetch(`${API_BASE}/leads/clear`, {
      method: 'POST',
      headers: apiHeaders()
    });
    const data = await res.json();
    if (data.success) {
      loadLeads();
      fetchMetrics();
      fetchLogs();
      alert('Pipeline CRM reset successfully! You can now launch a fresh scrape.');
    }
  } catch (err) {
    alert('Failed to clear pipeline.');
  }
}

// Manual Lead Modal
function openManualLeadModal() {
  document.getElementById('manualLeadModal').classList.add('open');
}

function closeManualLeadModal() {
  document.getElementById('manualLeadModal').classList.remove('open');
}

async function submitManualLead(e) {
  e.preventDefault();
  const name = document.getElementById('mName').value;
  const website = document.getElementById('mWebsite').value;
  const email = document.getElementById('mEmail').value;
  const phone = document.getElementById('mPhone').value;
  const category = document.getElementById('mCategory').value;
  const region = document.getElementById('mRegion').value;

  try {
    const res = await fetch(`${API_BASE}/leads/manual`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ name, website, email, phone, category, region })
    });
    const data = await res.json();

    if (data.success) {
      closeManualLeadModal();
      loadLeads();
      fetchMetrics();
    } else {
      alert(data.error || 'Failed to save lead.');
    }
  } catch (err) {
    alert('Error adding lead.');
  }
}

// Pitch Drawer Modal
async function openPitchModal(leadId) {
  activePitchLeadId = leadId;
  const lead = currentLeads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('pitchModalTitle').textContent = `Outreach Pitch for "${lead.name}"`;
  document.getElementById('pSubject').value = lead.pitchSubject || `Scaling Digital Workflows for ${lead.name}`;
  document.getElementById('pBody').value = lead.pitchBody || `Hi ${lead.name},\n\nWe design custom ERP systems, LMS portals, and apps at https://fusionengine.in.\nPortfolio: https://prakash-portfolio-alpha.vercel.app/\nWhatsApp: https://wa.me/916369884331\n\nBest regards,\nFusion Engine Technology`;
  document.getElementById('pWaIntro').value = lead.whatsappIntro || `Hi ${lead.name}, saw your site (${lead.website || ''}). We build custom software at fusionengine.in.`;

  document.getElementById('pitchModal').classList.add('open');

  // Trigger AI generation if empty
  if (!lead.pitchSubject) {
    document.getElementById('pSubject').value = 'Generating AI pitch with Gemini...';
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/pitch`, {
        method: 'POST',
        headers: apiHeaders()
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('pSubject').value = data.pitch.subject;
        document.getElementById('pBody').value = data.pitch.emailBody;
        document.getElementById('pWaIntro').value = data.pitch.whatsappIntro;
      }
    } catch (_) { }
  }
}

function closePitchModal() {
  document.getElementById('pitchModal').classList.remove('open');
  activePitchLeadId = null;
}

async function sendPitchEmail() {
  if (!activePitchLeadId) return;
  const subject = document.getElementById('pSubject').value;
  const body = document.getElementById('pBody').value;
  const btn = document.getElementById('btnDispatchEmail');

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(`${API_BASE}/leads/${activePitchLeadId}/email`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ subject, body })
    });
    const data = await res.json();

    if (data.success) {
      alert('Outreach email dispatched successfully!');
      closePitchModal();
      loadLeads();
      fetchMetrics();
    } else {
      alert(`Send Failed: ${data.reason || 'Check SMTP configuration in Settings.'}`);
    }
  } catch (err) {
    alert('Failed to dispatch email.');
  } finally {
    btn.disabled = false;
    btn.textContent = '✉️ Dispatch Email Now';
  }
}

async function handleWaDispatch(leadId) {
  const lead = currentLeads.find(l => l.id === leadId);
  if (!lead) return;

  try {
    const res = await fetch(`${API_BASE}/leads/${leadId}/whatsapp/send`, {
      method: 'POST',
      headers: apiHeaders()
    });
    const data = await res.json();

    if (data.success) {
      if (data.directSent) {
        alert(`✅ WhatsApp message sent directly to ${lead.name} (${data.phone || lead.phone || 'Lead'})!`);
      } else if (data.url) {
        window.open(data.url, '_blank');
        alert(`ℹ️ WhatsApp bot offline/unconnected. Opened Click-to-Chat fallback link for ${lead.name}.`);
      } else {
        alert(`WhatsApp action completed for ${lead.name}.`);
      }
      loadLeads();
      fetchMetrics();
    } else {
      alert(`WhatsApp Dispatch Failed: ${data.reason || 'Lead may be opted out or missing phone.'}`);
    }
  } catch (err) {
    alert('Failed to process WhatsApp request.');
  }
}

async function sendPitchWhatsApp() {
  if (!activePitchLeadId) return;
  const customMessage = document.getElementById('pWaIntro').value;
  const btn = document.getElementById('btnDispatchWa');
  const lead = currentLeads.find(l => l.id === activePitchLeadId);

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
  }

  try {
    const res = await fetch(`${API_BASE}/leads/${activePitchLeadId}/whatsapp/send`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ customMessage })
    });
    const data = await res.json();

    if (data.success) {
      if (data.directSent) {
        alert(`✅ WhatsApp pitch sent directly to ${lead ? lead.name : 'Lead'} (${data.phone})!`);
      } else if (data.url) {
        window.open(data.url, '_blank');
        alert(`ℹ️ WhatsApp bot offline. Opened Click-to-Chat fallback link.`);
      }
      closePitchModal();
      loadLeads();
      fetchMetrics();
    } else {
      alert(`WhatsApp Send Failed: ${data.reason || 'Lead opted out or error occurred.'}`);
    }
  } catch (err) {
    alert('Failed to dispatch WhatsApp message.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💬 Dispatch WhatsApp Direct';
    }
  }
}

// --- TAB 2: SOURCING & LIVE LOGS ---
async function triggerAutoSweep() {
  try {
    const res = await fetch(`${API_BASE}/scrape/auto-all`, {
      method: 'POST',
      headers: apiHeaders()
    });
    const data = await res.json();
    alert(data.message || 'Launched full autonomous discovery sweep across all locations & categories.');
    fetchLogs();
  } catch (err) {
    alert('Failed to launch autonomous sweep.');
  }
}

async function triggerScraper() {
  const category = document.getElementById('scrapeCategory').value;
  const region = document.getElementById('scrapeRegion').value;

  try {
    const res = await fetch(`${API_BASE}/scrape/trigger`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ category, region })
    });
    const data = await res.json();
    alert(data.message);
    fetchLogs();
  } catch (err) {
    alert('Failed to launch scraper.');
  }
}

async function fetchLogs() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/logs`, { headers: apiHeaders() });
    const data = await res.json();
    renderLogs(data.logs || []);
  } catch (_) { }
}

function renderLogs(logs) {
  const container = document.getElementById('terminalLog');
  if (!logs || logs.length === 0) return;

  container.innerHTML = logs.map(l => {
    let levelClass = 'log-info';
    if (l.level === 'WARN') levelClass = 'log-warn';
    if (l.level === 'ERROR') levelClass = 'log-error';

    const time = new Date(l.timestamp).toLocaleTimeString();
    return `<div class="log-line"><span class="log-time">[${time}]</span> <span class="${levelClass}">[${l.level}]</span> ${escapeHtml(l.message)}</div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function savePromptTemplate() {
  const promptTemplate = document.getElementById('promptTemplate').value;
  try {
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ promptTemplate })
    });
    alert('Prompt template saved successfully.');
  } catch (err) {
    alert('Failed to save prompt template.');
  }
}

// --- TAB 3: FOLLOW-UP MANAGER & OPT-OUTS ---
async function loadOptOuts() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/optouts`, { headers: apiHeaders() });
    const data = await res.json();
    const list = data.optOuts || [];
    const tbody = document.getElementById('optOutTableBody');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:16px; color:var(--text-muted);">No entries in opt-out list.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => `
      <tr>
        <td><code>${escapeHtml(item)}</code></td>
        <td><button class="btn btn-sm btn-secondary" onclick="removeManualOptOut('${escapeHtml(item)}')">Remove Block</button></td>
      </tr>
    `).join('');
  } catch (_) { }
}

async function addManualOptOut() {
  const input = document.getElementById('newOptOutInput');
  const identifier = input.value.trim();
  if (!identifier) return;

  try {
    await fetch(`${API_BASE}/optouts`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ identifier })
    });
    input.value = '';
    loadOptOuts();
  } catch (_) { }
}

async function removeManualOptOut(identifier) {
  try {
    await fetch(`${API_BASE}/optouts`, {
      method: 'DELETE',
      headers: apiHeaders(),
      body: JSON.stringify({ identifier })
    });
    loadOptOuts();
  } catch (_) { }
}

// --- TAB 4: PROPOSAL GENERATOR ---
async function generateSOWProposal(e) {
  e.preventDefault();
  const clientName = document.getElementById('propClientName').value;
  const projectScope = document.getElementById('propScope').value;
  const techStack = document.getElementById('propTechStack').value.split(',').map(t => t.trim()).filter(Boolean);
  const preview = document.getElementById('proposalPreview');

  preview.textContent = '⚡ Architecting Scope of Work Proposal via Gemini AI... Please wait...';

  try {
    const res = await fetch(`${API_BASE}/generate-proposal`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ clientName, projectScope, targetTech: techStack })
    });
    const data = await res.json();

    if (data.success) {
      preview.textContent = data.proposal;
    } else {
      preview.textContent = 'Failed to generate proposal: ' + (data.error || 'Unknown error');
    }
  } catch (err) {
    preview.textContent = 'Error connecting to proposal generator API.';
  }
}

function copyProposalToClipboard() {
  const text = document.getElementById('proposalPreview').textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('Proposal copied to clipboard!');
  }).catch(() => {
    alert('Failed to copy text.');
  });
}

// --- TAB 5: SETTINGS ---
async function loadSettings() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/settings`, { headers: apiHeaders() });
    const data = await res.json();
    const s = data.settings || {};

    document.getElementById('settingColdEmail').value = String(s.coldEmailEnabled);
    document.getElementById('settingRateLimit').value = s.scraperRateLimit || 60;
    if (s.promptTemplate) {
      document.getElementById('promptTemplate').value = s.promptTemplate;
    }

    // Status badges
    const waBadge = document.getElementById('waStatusBadge');
    if (s.whatsappConnected) {
      waBadge.className = 'badge badge-hot';
      waBadge.textContent = '🟢 Connected (open-wa session)';
    } else {
      waBadge.className = 'badge badge-warm';
      waBadge.textContent = '⚡ Click-to-Chat Mode Active';
    }
  } catch (_) { }
}

async function saveSettingsForm(e) {
  e.preventDefault();
  const coldEmailEnabled = document.getElementById('settingColdEmail').value === 'true';
  const scraperRateLimit = parseInt(document.getElementById('settingRateLimit').value, 10);
  const geminiKey = document.getElementById('settingGeminiKey').value;
  const smtpPass = document.getElementById('settingSmtpPass').value;

  const payload = { coldEmailEnabled, scraperRateLimit };
  if (geminiKey) payload.geminiKey = geminiKey;
  if (smtpPass) payload.smtpPass = smtpPass;

  try {
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
    alert('Settings configuration saved successfully.');
    loadSettings();
  } catch (err) {
    alert('Failed to save settings.');
  }
}

// --- UTILS ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
