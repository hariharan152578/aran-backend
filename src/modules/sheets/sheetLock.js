/**
 * Serialises calculations against a single Google Sheets workbook.
 *
 * WHY THIS EXISTS
 * Code.gs's doPost mutates shared state: it writes the windows into the input
 * columns, flushes, reads the whole grid back, then wipes the inputs. Two
 * overlapping requests interleave - the second clears and rewrites the block
 * while the first is still waiting on flush, so the first reads back the
 * second's numbers. Nothing errors; the order is just silently wrong.
 *
 * GRANULARITY: PER WORKBOOK, NOT PER TAB
 * Locking per tab would look sufficient and isn't. The material tabs reference
 * the calculation tab across sheets - "Material & Hardware"!C5 is =FIX!H6 - so
 * calculating tab SLIDING while tab FIX is mid-write returns a materialGrid
 * built from FIX's transient state. The webAppUrl identifies the workbook, so
 * that is the lock key.
 *
 * LIMITS - these are real and worth stating plainly:
 *
 *  1. In-process only. Correct for the current single `node src/index.js`. Under
 *     PM2 cluster mode, multiple containers, or a blue/green overlap it gives
 *     ZERO protection, because each process has its own Map. The upgrade path is
 *     a Mongo advisory lock (findOneAndUpdate on a SheetLock collection with an
 *     expiresAt TTL index); withSheetLock's signature is designed so only this
 *     file changes.
 *
 *  2. It cannot see anything outside this process - a person editing the
 *     workbook in a browser tab, or the old prototype console hitting the same
 *     /exec URL. That hole is closed on the Apps Script side by LockService in
 *     backend/apps-script/Code.gs. This lock stays because it gives fast,
 *     friendly queueing instead of Apps Script lock-timeout failures.
 */

const DEFAULT_MAX_QUEUE = Number(process.env.GSHEET_MAX_QUEUE) || 50;
const DEFAULT_QUEUE_TIMEOUT_MS = Number(process.env.GSHEET_QUEUE_TIMEOUT_MS) || 60000;

/** key -> Promise that resolves when the currently-queued tail finishes. */
const chains = new Map();
/** key -> number of callers holding or waiting for the lock. */
const depth = new Map();

/**
 * Runs `fn` with exclusive access to `key`, queueing behind any in-flight call.
 *
 * Rejects fast with status 429 rather than queueing without bound: a caller who
 * waits four minutes behind ten others has already timed out at the browser, so
 * admitting them only wastes an Apps Script quota slot.
 */
export async function withSheetLock(key, fn, {
  maxQueue = DEFAULT_MAX_QUEUE,
  queueTimeoutMs = DEFAULT_QUEUE_TIMEOUT_MS
} = {}) {
  if (!key) return fn(); // nothing to serialise against

  const queued = depth.get(key) || 0;
  if (queued >= maxQueue) {
    const err = new Error(
      `${queued} calculations are already queued for this spreadsheet. Please try again in a moment.`
    );
    err.status = 429;
    throw err;
  }
  depth.set(key, queued + 1);

  // Each caller appends a gate to the chain and waits for the previous tail.
  // The chain is built from `gate` (not from fn's result) so one caller's
  // failure never breaks the queue for the next.
  const previous = chains.get(key) || Promise.resolve();
  let openGate;
  const gate = new Promise(resolve => { openGate = resolve; });
  chains.set(key, previous.then(() => gate));

  let acquired = false;
  let timer = null;
  try {
    await Promise.race([
      previous,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            'Timed out waiting for the spreadsheet to become free. Another calculation is taking unusually long.'
          );
          err.status = 503;
          reject(err);
        }, queueTimeoutMs);
      })
    ]);
    acquired = true;
    return await fn();
  } finally {
    if (timer) clearTimeout(timer);

    // Always open the gate, even when we timed out waiting and never ran: the
    // chain has our gate in it, so leaving it closed would stall every later
    // caller forever.
    openGate();
    void acquired;

    const remaining = (depth.get(key) || 1) - 1;
    if (remaining <= 0) {
      // Last one out clears both maps so keys for one-off templates don't
      // accumulate for the lifetime of the process.
      depth.delete(key);
      if (chains.get(key) !== undefined) chains.delete(key);
    } else {
      depth.set(key, remaining);
    }
  }
}

/** Diagnostics for the template Overview / health checks. */
export function lockStats() {
  return Object.fromEntries([...depth.entries()].map(([key, n]) => [key, n]));
}
