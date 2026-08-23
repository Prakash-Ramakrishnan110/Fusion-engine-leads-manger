const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const OPTED_OUT_FILE = path.join(DATA_DIR, 'opted_out.json');
const MESSAGE_LOG_FILE = path.join(DATA_DIR, 'message_log.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SYSTEM_LOGS_FILE = path.join(DATA_DIR, 'system_logs.json');

const MAX_LOG_ENTRIES = 1000;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-process lock queue to prevent race conditions between Cron & Express API
let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  writeQueue = writeQueue.then(() => task()).catch(err => {
    console.error('[DB Lock Error]', err);
  });
  return writeQueue;
}

/**
 * Atomic write helper using temporary file + rename to prevent corruption
 */
function safeWriteJSON(filePath, data) {
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    throw err;
  }
}

function safeReadJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      safeWriteJSON(filePath, fallback);
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[DB Read Error] ${filePath}:`, err.message);
    return fallback;
  }
}

// --- LEADS STORAGE ---
function getLeads() {
  return safeReadJSON(LEADS_FILE, []);
}

function saveLeads(leads) {
  return enqueueWrite(() => {
    safeWriteJSON(LEADS_FILE, leads);
  });
}

function saveLead(lead) {
  return enqueueWrite(() => {
    const leads = safeReadJSON(LEADS_FILE, []);
    const idx = leads.findIndex(l => l.id === lead.id);
    if (idx >= 0) {
      leads[idx] = { ...leads[idx], ...lead, updatedAt: new Date().toISOString() };
    } else {
      leads.push({ ...lead, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    safeWriteJSON(LEADS_FILE, leads);
  });
}

// --- OPTED OUT STORAGE ---
function getOptOuts() {
  return safeReadJSON(OPTED_OUT_FILE, []);
}

function addOptOut(entry) {
  return enqueueWrite(() => {
    const list = safeReadJSON(OPTED_OUT_FILE, []);
    const cleanEntry = typeof entry === 'string' ? entry.trim().toLowerCase() : entry;
    if (!list.includes(cleanEntry)) {
      list.push(cleanEntry);
      safeWriteJSON(OPTED_OUT_FILE, list);
    }
  });
}

function removeOptOut(entry) {
  return enqueueWrite(() => {
    const list = safeReadJSON(OPTED_OUT_FILE, []);
    const cleanEntry = typeof entry === 'string' ? entry.trim().toLowerCase() : entry;
    const filtered = list.filter(item => item !== cleanEntry);
    safeWriteJSON(OPTED_OUT_FILE, filtered);
  });
}

// --- MESSAGE LOG & ROTATION ---
function getMessageLogs() {
  return safeReadJSON(MESSAGE_LOG_FILE, []);
}

function logMessage(entry) {
  return enqueueWrite(() => {
    let logs = safeReadJSON(MESSAGE_LOG_FILE, []);
    logs.unshift({
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Log Rotation / Cap to prevent unbounded file growth
    if (logs.length > MAX_LOG_ENTRIES) {
      logs = logs.slice(0, MAX_LOG_ENTRIES);
    }
    safeWriteJSON(MESSAGE_LOG_FILE, logs);
  });
}

// --- SYSTEM LOGS (LIVE TERMINAL) ---
function getSystemLogs() {
  return safeReadJSON(SYSTEM_LOGS_FILE, []);
}

function appendSystemLog(level, message, metadata = {}) {
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata
  };
  return enqueueWrite(() => {
    let logs = safeReadJSON(SYSTEM_LOGS_FILE, []);
    logs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) {
      logs = logs.slice(logs.length - MAX_LOG_ENTRIES);
    }
    safeWriteJSON(SYSTEM_LOGS_FILE, logs);
  });
}

// --- SETTINGS STORAGE ---
const DEFAULT_SETTINGS = {
  botActive: true,
  coldEmailEnabled: true,
  scraperRateLimit: 60, // requests per hour
  promptTemplate: '',
  smtpVerified: false,
  whatsappConnected: false,
  geminiKeySet: false
};

function getSettings() {
  const current = safeReadJSON(SETTINGS_FILE, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...current };
}

function updateSettings(updates) {
  return enqueueWrite(() => {
    const current = safeReadJSON(SETTINGS_FILE, DEFAULT_SETTINGS);
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    safeWriteJSON(SETTINGS_FILE, updated);
  });
}

module.exports = {
  getLeads,
  saveLeads,
  saveLead,
  getOptOuts,
  addOptOut,
  removeOptOut,
  getMessageLogs,
  logMessage,
  getSystemLogs,
  appendSystemLog,
  getSettings,
  updateSettings
};
