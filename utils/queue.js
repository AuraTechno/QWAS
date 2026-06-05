// Simple in-process async queue with concurrency control + retry.
const logger = require("./logger");

const queues = new Map();

function createQueue(name, opts = {}) {
  if (queues.has(name)) return queues.get(name);
  const concurrency = opts.concurrency || 2;
  const retries = opts.retries != null ? opts.retries : 2;
  const retryDelay = opts.retryDelay || 1000;
  const handlers = new Map();
  let running = 0;
  const pending = [];

  const q = {
    name,
    process(type, fn) {
      handlers.set(type, fn);
    },
    add(type, payload) {
      pending.push({ type, payload, attempts: 0 });
      drain();
    },
    size() { return pending.length; },
    busy() { return running; },
    on(event, fn) { (q._events ||= {})[event] = fn; }
  };

  async function runJob(job) {
    const handler = handlers.get(job.type);
    if (!handler) { logger.warn(`Queue ${name}: no handler for ${job.type}`); return; }
    try {
      await handler(job.payload);
      q._events?.success?.(job);
    } catch (e) {
      job.attempts += 1;
      if (job.attempts <= retries) {
        logger.warn(`Queue ${name}: ${job.type} failed (attempt ${job.attempts}), retrying…`);
        setTimeout(() => { pending.push(job); drain(); }, retryDelay * job.attempts);
      } else {
        logger.error(`Queue ${name}: ${job.type} failed permanently:`, e.message);
        q._events?.error?.(job, e);
      }
    } finally {
      running -= 1;
      drain();
    }
  }

  function drain() {
    while (running < concurrency && pending.length > 0) {
      const job = pending.shift();
      running += 1;
      runJob(job);
    }
  }

  queues.set(name, q);
  return q;
}

function getQueue(name) { return queues.get(name); }

module.exports = { createQueue, getQueue };
