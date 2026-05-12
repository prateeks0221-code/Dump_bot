/**
 * In-process async enrichment queue.
 * Concurrency-limited pool — up to 3 jobs simultaneously.
 * Idempotency guard: in-memory Set prevents double-enrichment of same pageId.
 * No external deps (no Redis/BullMQ) — matches current infra.
 */
const logger = require('../../utils/logger');

const MAX_CONCURRENT = 3;
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max per job

class EnrichmentQueue {
  constructor() {
    this.running   = 0;
    this.queue     = [];
    this.active    = new Set(); // pageIds currently enriching
    this.done      = new Set(); // pageIds already enriched (survives retries)
    this.stats     = { enqueued: 0, completed: 0, failed: 0, skipped: 0 };
  }

  /**
   * Enqueue an enrichment job. Fire-and-forget — does NOT return a promise
   * the caller needs to await. Errors are caught internally.
   */
  push(pageId, jobFn) {
    if (this.done.has(pageId)) {
      logger.info(`enrichmentQueue: skip ${pageId} — already enriched`);
      this.stats.skipped++;
      return;
    }
    if (this.active.has(pageId)) {
      logger.info(`enrichmentQueue: skip ${pageId} — enrichment in flight`);
      this.stats.skipped++;
      return;
    }

    this.stats.enqueued++;
    this.queue.push({ pageId, jobFn });
    this._tick();
  }

  _tick() {
    while (this.running < MAX_CONCURRENT && this.queue.length > 0) {
      const { pageId, jobFn } = this.queue.shift();
      this.running++;
      this.active.add(pageId);

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`enrichment timeout after ${JOB_TIMEOUT_MS}ms`)), JOB_TIMEOUT_MS)
      );

      Promise.race([jobFn(), timeout])
        .then(() => {
          this.done.add(pageId);
          this.stats.completed++;
          logger.info(`enrichmentQueue: completed ${pageId}`);
        })
        .catch((err) => {
          this.stats.failed++;
          logger.error(`enrichmentQueue: failed ${pageId} — ${err.message}`);
          // Don't add to done — allows manual retry / next-run recovery
        })
        .finally(() => {
          this.active.delete(pageId);
          this.running--;
          this._tick();
        });
    }
  }

  getStats() {
    return {
      ...this.stats,
      running: this.running,
      queued: this.queue.length,
      activeIds: [...this.active],
    };
  }
}

// Singleton — one queue for the whole process
const queue = new EnrichmentQueue();
module.exports = { queue };
