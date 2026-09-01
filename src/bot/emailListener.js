/**
 * Inbound Email Listener (IMAP)
 * Monitors inbox for replies to automated follow-ups.
 * If a prospect replies, it halts their sequence and marks them as Hot.
 */

const { getLeads, saveLead, appendSystemLog } = require('../../data/db');

let client;

async function initializeImapListener() {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    appendSystemLog('WARN', 'IMAP_USER or IMAP_PASS missing in .env. Email Reply Detection is DISABLED.');
    return;
  }

  try {
    const { ImapFlow } = require('imapflow');
    
    client = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: process.env.IMAP_PORT || 993,
      secure: true,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS
      },
      logger: false
    });

    await client.connect();
    appendSystemLog('INFO', `IMAP Connected to ${process.env.IMAP_USER}. Listening for inbound replies...`);

    // Select and lock the INBOX
    let lock = await client.getMailboxLock('INBOX');
    try {
      client.on('exists', async data => {
        appendSystemLog('INFO', `New email detected via IMAP. Processing...`);
        // We fetch the latest message header
        for await (let msg of client.fetch(data.count, { envelope: true })) {
          const fromAddress = msg.envelope.from[0].address;
          await processInboundEmail(fromAddress, msg.envelope.subject);
        }
      });
    } finally {
      lock.release();
    }
  } catch (err) {
    appendSystemLog('WARN', `IMAP Listener Failed: ${err.message}. (Did you run npm install imapflow?)`);
  }
}

async function processInboundEmail(senderEmail, subject) {
  if (!senderEmail) return;

  const leads = getLeads();
  // Find lead by email
  const lead = leads.find(l => l.email && l.email.toLowerCase() === senderEmail.toLowerCase());

  if (lead) {
    appendSystemLog('INFO', `🔥 SMART REPLY DETECTED from ${senderEmail}! Halting automated follow-ups.`);
    
    lead.status = 'Replied';
    lead.repliedAt = new Date().toISOString();
    lead.tier = 'Hot'; // Automatically upgrade tier to Hot
    lead.score = Math.max(lead.score || 85, 90);
    
    await saveLead(lead);
  }
}

module.exports = {
  initializeImapListener
};
