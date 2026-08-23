/**
 * Rate Limiter and Queue Manager for Scrapers & Gemini API Calls
 */

class RateLimiter {
  constructor(options = {}) {
    this.maxPerMinute = options.maxPerMinute || 30;
    this.minDelayMs = options.minDelayMs || 1000;
    this.queue = [];
    this.active = false;
    this.lastExecTime = 0;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, retries: 0 });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      const now = Date.now();
      const timeSinceLast = now - this.lastExecTime;

      if (timeSinceLast < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - timeSinceLast));
      }

      this.queue.shift();
      this.lastExecTime = Date.now();

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        // Exponential backoff for rate limits / 429 errors
        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
        if (isRateLimit && item.retries < 3) {
          item.retries++;
          const delay = Math.pow(2, item.retries) * 2000; // 4s, 8s, 16s
          console.warn(`[RateLimiter] Rate limited (429). Retrying in ${delay}ms... (Attempt ${item.retries}/3)`);
          await new Promise(r => setTimeout(r, delay));
          this.queue.unshift(item); // Re-queue at top
        } else {
          item.reject(err);
        }
      }
    }

    this.active = false;
  }
}

const scraperLimiter = new RateLimiter({ maxPerMinute: 20, minDelayMs: 2000 });
const geminiLimiter = new RateLimiter({ maxPerMinute: 15, minDelayMs: 3000 });

module.exports = {
  RateLimiter,
  scraperLimiter,
  geminiLimiter
};
