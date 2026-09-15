/**
 * Tests for the Google Sheets calculation module.
 *
 * Run with:  node --test src/modules/sheets/
 * (node:test ships with Node 18+, so this needs no dependencies.)
 *
 * The structure fixtures below mirror the real workbooks:
 *   Fixed Breeze Production.xlsx  -> ["FIX", "Material & Hardware"]
 *   OP-OP V.Cutting ...xlsx       -> ["OP-OP", "Profile & Hardwares"]
 * including the OP-OP hints that the pre-fix Code.gs produced, so the safety
 * net for stale deployments stays covered.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateWebAppUrl, AppsScriptError, fetchStructure, postOrder } from './appsScriptClient.js';
import { summariseStructure, toInputHints } from './structureService.js';
import { withSheetLock, lockStats } from './sheetLock.js';

/**
 * Shape of a real Fixed Breeze Production workbook: one calculable tab plus a
 * material tab, with the input hints the fixed Code.gs produces.
 */
const FIX_SHEETS = {
  'Material & Hardware': {
    max_row: 26, max_col: 3,
    merged_ranges: ['A1:C1', 'A2:C2'],
    input_field_hints: { w_no_col: null, width_col: null, height_col: null, header_row: null },
    cells: { A1: {}, A3: {}, B3: {} }
  },
  FIX: {
    max_row: 16, max_col: 10,
    merged_ranges: ['D6:E14', 'A3:E3'],
    input_field_hints: {
      w_no_col: 'A', width_col: 'B', height_col: 'C',
      header_row: 5, data_start_row: 6, data_end_row: 14
    },
    cells: { A1: {}, B1: {}, H6: {} }
  }
};

// ── appsScriptClient: URL validation ──────────────────────────────────────

test('validateWebAppUrl accepts a consumer /exec URL and trims it', () => {
  assert.equal(
    validateWebAppUrl('  https://script.google.com/macros/s/AKfy_12-3/exec  '),
    'https://script.google.com/macros/s/AKfy_12-3/exec'
  );
});

test('validateWebAppUrl accepts a Workspace domain /a/macros URL', () => {
  const url = 'https://script.google.com/a/macros/acme.com/s/AKfy1/exec';
  assert.equal(validateWebAppUrl(url), url);
});

test('validateWebAppUrl rejects an empty URL', () => {
  assert.throws(() => validateWebAppUrl(''), err => err.kind === 'BAD_URL');
});

test('validateWebAppUrl rejects a /dev URL and explains why', () => {
  // /dev looks almost identical to /exec but only works for the script owner,
  // producing a baffling HTML response for everyone else.
  assert.throws(
    () => validateWebAppUrl('https://script.google.com/macros/s/AKfy1/dev'),
    err => err.kind === 'BAD_URL' && /dev URL/.test(err.message)
  );
});

test('validateWebAppUrl rejects the spreadsheet URL and points at Apps Script', () => {
  // The most likely user mistake: pasting the sheet URL from the address bar.
  assert.throws(
    () => validateWebAppUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=0'),
    err => err.kind === 'BAD_URL' && /Extensions/.test(err.message)
  );
});

test('validateWebAppUrl rejects an unrelated URL', () => {
  assert.throws(() => validateWebAppUrl('http://example.com/exec'), err => err.kind === 'BAD_URL');
});

test('AppsScriptError maps each kind to the right HTTP status', () => {
  const status = kind => new AppsScriptError('x', { kind }).httpStatus;
  assert.equal(status('BAD_URL'), 400);
  assert.equal(status('TIMEOUT'), 504);
  assert.equal(status('NETWORK'), 503);
  assert.equal(status('NON_JSON'), 502);
  assert.equal(status('SCRIPT_ERROR'), 502);
  assert.equal(status('HTTP'), 502);
});

// ── appsScriptClient: error message classification ────────────────────────
//
// These go through the real fetch path with a stubbed global fetch, because the
// classifier only earns its keep on the actual bodies Google serves.

async function withStubbedFetch(response, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const stub = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body
});

const EXEC = 'https://script.google.com/macros/s/AKfy1/exec';

test('a 404 blames the deployment URL, not the script', async () => {
  // Google's 404 page embeds a lot of minified JS that contains the word
  // "Exception". Reporting a script crash here sends the user to an execution
  // log that is empty, so the status has to win over the text heuristic.
  const googleNotFound =
    '<!DOCTYPE html><html lang="en"><head><script nonce="x">' +
    'function k(a){throw new Exception("nope")}</script></head><body>Not Found</body></html>';

  await withStubbedFetch(stub(googleNotFound, { status: 404 }), async () => {
    await assert.rejects(
      fetchStructure(EXEC),
      err => {
        assert.equal(err.kind, 'HTTP');
        assert.equal(err.status, 404);
        assert.match(err.message, /not found/i);
        assert.doesNotMatch(err.message, /execution log/i, 'must not blame the script for a bad URL');
        return true;
      }
    );
  });
});

test('an authorization page tells the user to redeploy as Anyone', async () => {
  await withStubbedFetch(
    stub('<html><body>Authorization is required to perform that action.</body></html>', { status: 401 }),
    async () => {
      await assert.rejects(fetchStructure(EXEC), err => /Anyone/.test(err.message));
    }
  );
});

test('a sign-in redirect tells the user to redeploy as Anyone', async () => {
  await withStubbedFetch(
    stub('<html><head><meta http-equiv="refresh" content="0;url=https://accounts.google.com/ServiceLogin?x=1"></head></html>'),
    async () => {
      await assert.rejects(fetchStructure(EXEC), err => err.kind === 'NON_JSON' && /Anyone/.test(err.message));
    }
  );
});

test('a genuine script stack trace does point at the execution log', async () => {
  // Non-HTML body, so the runtime-error heuristic is allowed to fire.
  await withStubbedFetch(stub('TypeError: Cannot read properties of null\n  at doGet:12'), async () => {
    await assert.rejects(fetchStructure(EXEC), err => /execution log/i.test(err.message));
  });
});

test('an {error} body in a 200 response is treated as a failure', async () => {
  // Code.gs reports application errors as HTTP 200 JSON, so a 2xx alone means
  // nothing.
  await withStubbedFetch(stub(JSON.stringify({ error: 'No sheet named "NOPE" found in this workbook.' })), async () => {
    await assert.rejects(
      fetchStructure(EXEC),
      err => err.kind === 'SCRIPT_ERROR' && /No sheet named/.test(err.message)
    );
  });
});

test('a 200 that is valid JSON but not a structure is rejected clearly', async () => {
  await withStubbedFetch(stub(JSON.stringify({ status: 'Webhook is live.' })), async () => {
    await assert.rejects(fetchStructure(EXEC), err => /Deploy the Code.gs/.test(err.message));
  });
});

test('a successful structure fetch returns the sheets and a duration', async () => {
  await withStubbedFetch(stub(JSON.stringify({ sheets: FIX_SHEETS })), async () => {
    const { sheets, durationMs } = await fetchStructure(EXEC);
    assert.deepEqual(Object.keys(sheets).sort(), ['FIX', 'Material & Hardware']);
    assert.equal(typeof durationMs, 'number');
  });
});

test('postOrder refuses to send an empty window list', async () => {
  // Posting zero windows would clear the sheet's inputs and return the empty
  // template as though it were a result.
  await assert.rejects(
    postOrder(EXEC, { sheetName: 'FIX', windows: [] }),
    err => err.kind === 'BAD_URL' && /at least one window/i.test(err.message)
  );
});

test('postOrder requires a target tab', async () => {
  await assert.rejects(
    postOrder(EXEC, { sheetName: '', windows: [{ width: 1200, height: 900 }] }),
    err => /sheetName is required/.test(err.message)
  );
});

test('postOrder coerces dimensions to numbers and omits an unset material tab', async () => {
  // An older deployment ignores materialSheetName and falls back to its
  // hardcoded default, which is what we want - so only send it when set.
  let sent = null;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return stub(JSON.stringify({ sheetName: 'FIX', grid: { startRow: 1, startCol: 1, values: [[1]] } }));
  };
  try {
    await postOrder(EXEC, { sheetName: 'FIX', windows: [{ width: '1200', height: '900' }] });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(sent.windows, [{ width: 1200, height: 900 }]);
  assert.equal('materialSheetName' in sent, false);
});

test('postOrder rejects a response with no grid', async () => {
  await withStubbedFetch(stub(JSON.stringify({ sheetName: 'FIX' })), async () => {
    await assert.rejects(
      postOrder(EXEC, { sheetName: 'FIX', windows: [{ width: 1, height: 1 }] }),
      err => /did not return a calculated grid/.test(err.message)
    );
  });
});

// ── structureService: tab summarisation ───────────────────────────────────

test('summariseStructure puts calculable tabs first', () => {
  // The material tab is first in the source object; FIX must still lead.
  const { tabs } = summariseStructure(FIX_SHEETS);
  assert.equal(tabs[0].name, 'FIX');
  assert.equal(tabs[0].calculable, true);
  assert.equal(tabs[1].calculable, false);
});

test('summariseStructure recognises material tabs under either real name', () => {
  const { tabs } = summariseStructure(FIX_SHEETS);
  assert.equal(tabs[1].isMaterialCandidate, true);

  // The OP-OP workbook names it differently; hardcoding one name was the
  // original bug that returned no BOM at all.
  const opop = summariseStructure({
    'Profile & Hardwares': { max_row: 27, max_col: 9, merged_ranges: [], input_field_hints: {}, cells: {} }
  });
  assert.equal(opop.tabs[0].isMaterialCandidate, true);
});

test('summariseStructure suggests both tabs for the picker', () => {
  const { suggested } = summariseStructure(FIX_SHEETS);
  assert.deepEqual(suggested, { sheetName: 'FIX', materialSheetName: 'Material & Hardware' });
});

test('summariseStructure omits cells so the verify payload stays small', () => {
  // cells is the bulk of a blueprint and is useless for choosing a tab.
  const { tabs } = summariseStructure(FIX_SHEETS);
  assert.equal('cells' in tabs[0], false);
  assert.equal(tabs[0].cellCount, 3); // counted, not carried
});

test('summariseStructure does not warn about correctly detected columns', () => {
  const { tabs } = summariseStructure(FIX_SHEETS);
  assert.equal(tabs[0].warning, null);
});

test('summariseStructure warns when hints look like the OP-OP misdetection', () => {
  // These are the exact hints the pre-fix Code.gs produced for the real OP-OP
  // sheet: the steel-cutting block instead of the customer input block. A
  // template may still point at a deployment that has not been updated, so the
  // tab picker has to surface it before the user saves.
  const { tabs } = summariseStructure({
    'OP-OP': {
      max_row: 36, max_col: 23, merged_ranges: [],
      input_field_hints: {
        w_no_col: 'K', width_col: 'N', height_col: 'P',
        header_row: 24, data_start_row: 25, data_end_row: 35
      },
      cells: {}
    }
  });
  assert.ok(tabs[0].warning, 'expected a warning for width=N height=P row=24');
  assert.match(tabs[0].warning, /apps-script/, 'warning should say how to fix it');
});

test('summariseStructure accepts the corrected OP-OP hints without warning', () => {
  // After deploying the fixed Code.gs, OP-OP detects A/B/C at row 5 -
  // verified against the real workbook.
  const { tabs } = summariseStructure({
    'OP-OP': {
      max_row: 36, max_col: 23, merged_ranges: [],
      input_field_hints: {
        w_no_col: 'A', width_col: 'B', height_col: 'C',
        header_row: 5, data_start_row: 6, data_end_row: 14
      },
      cells: {}
    }
  });
  assert.equal(tabs[0].warning, null);
});

test('summariseStructure handles a workbook with no calculable tab', () => {
  const { tabs, suggested } = summariseStructure({
    Rates: { max_row: 5, max_col: 2, merged_ranges: [], input_field_hints: null, cells: {} }
  });
  assert.equal(tabs[0].calculable, false);
  assert.equal(suggested.sheetName, '');
});

test('toInputHints converts snake_case to the Template sub-document shape', () => {
  assert.deepEqual(toInputHints(FIX_SHEETS.FIX.input_field_hints), {
    wNoCol: 'A', widthCol: 'B', heightCol: 'C',
    headerRow: 5, dataStartRow: 6, dataEndRow: 14
  });
});

test('toInputHints nulls everything for a non-calculable tab', () => {
  assert.deepEqual(toInputHints({ width_col: null, height_col: null }), {
    wNoCol: null, widthCol: null, heightCol: null,
    headerRow: null, dataStartRow: null, dataEndRow: null
  });
});

// ── sheetLock: serialisation ──────────────────────────────────────────────

const tick = ms => new Promise(r => setTimeout(r, ms));

test('withSheetLock serialises overlapping calls on the same workbook', async () => {
  // This is the whole point of the lock: doPost writes, flushes, reads, then
  // wipes, so two interleaved calls read each other's inputs.
  const events = [];
  const job = name => withSheetLock('url-A', async () => {
    events.push(`${name}:start`);
    await tick(20);
    events.push(`${name}:end`);
  });

  await Promise.all([job('first'), job('second')]);

  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('withSheetLock runs different workbooks concurrently', async () => {
  // Separate workbooks share no cells, so serialising them would only be slow.
  const events = [];
  const job = (key, name) => withSheetLock(key, async () => {
    events.push(`${name}:start`);
    await tick(20);
    events.push(`${name}:end`);
  });

  await Promise.all([job('url-B', 'b'), job('url-C', 'c')]);

  // Both start before either finishes.
  assert.deepEqual(events.slice(0, 2).sort(), ['b:start', 'c:start']);
});

test('withSheetLock releases the lock when the job throws', async () => {
  // A failed calculation must not stall the queue forever.
  await assert.rejects(
    withSheetLock('url-D', async () => { throw new Error('apps script exploded'); }),
    /apps script exploded/
  );

  let ran = false;
  await withSheetLock('url-D', async () => { ran = true; });
  assert.equal(ran, true, 'the next caller should still acquire the lock');
});

test('withSheetLock rejects with 429 once the queue is full', async () => {
  // Queueing without bound only wastes Apps Script quota on callers whose
  // browser request has already timed out.
  const opts = { maxQueue: 2 };
  const held = withSheetLock('url-E', () => tick(60), opts);
  const queued = withSheetLock('url-E', () => tick(1), opts);

  await assert.rejects(
    withSheetLock('url-E', () => tick(1), opts),
    err => err.status === 429
  );

  await Promise.all([held, queued]);
});

test('withSheetLock times out waiting rather than hanging, and keeps the queue alive', async () => {
  const slow = withSheetLock('url-F', () => tick(200));
  await assert.rejects(
    withSheetLock('url-F', () => tick(1), { queueTimeoutMs: 30 }),
    err => err.status === 503
  );
  await slow;

  // The timed-out caller still opened its gate, so later callers are not stuck.
  let ran = false;
  await withSheetLock('url-F', async () => { ran = true; });
  assert.equal(ran, true);
});

test('withSheetLock cleans up its bookkeeping so keys do not accumulate', async () => {
  await withSheetLock('url-G', async () => {});
  assert.equal(lockStats()['url-G'], undefined);
});

test('withSheetLock runs the job when no key is given', async () => {
  let ran = false;
  await withSheetLock('', async () => { ran = true; });
  assert.equal(ran, true);
});
