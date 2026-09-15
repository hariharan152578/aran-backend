/**
 * Talks HTTP to a Google Apps Script Web App. No Mongo, no business logic -
 * this module's only job is to turn an Apps Script deployment into either a
 * parsed JSON object or a useful error.
 *
 * Apps Script is an awkward HTTP citizen and every quirk below is deliberate:
 *
 *  - It answers /exec with a 302 to googleusercontent.com and serves the real
 *    body from there. Node's fetch follows redirects by default; we set it
 *    explicitly so nobody "tidies" it away.
 *
 *  - It reports application errors as HTTP 200 with an {error} JSON body
 *    (see Code.gs jsonResponse), so a 2xx status alone means nothing.
 *
 *  - When the deployment is misconfigured it serves an HTML login or error
 *    page, again with a 200. Blindly calling res.json() there throws
 *    "Unexpected token '<'", which tells the user nothing about the actual
 *    problem, so we read text first and classify it.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.GSHEET_TIMEOUT_MS) || 120000;

// Accepts both the consumer form (/macros/s/<id>/exec) and the Workspace
// domain form (/a/macros/<domain>/s/<id>/exec).
const EXEC_URL_RE =
  /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]+\/exec(\?.*)?$/;

/** kind: BAD_URL | TIMEOUT | NETWORK | HTTP | NON_JSON | SCRIPT_ERROR */
export class AppsScriptError extends Error {
  constructor(message, { kind, status = null, snippet = null, url = null } = {}) {
    super(message);
    this.name = 'AppsScriptError';
    this.kind = kind;
    this.status = status;
    this.snippet = snippet;
    this.url = url;
  }

  /** HTTP status Aran should answer with when this error reaches a route. */
  get httpStatus() {
    switch (this.kind) {
      case 'BAD_URL': return 400;
      case 'TIMEOUT': return 504;
      case 'NETWORK': return 503;
      default: return 502; // HTTP | NON_JSON | SCRIPT_ERROR
    }
  }

  toJSON() {
    return { kind: this.kind, message: this.message, status: this.status, snippet: this.snippet };
  }
}

/**
 * Rejects anything that isn't a deployed Apps Script web app URL, so the user
 * finds out at verify time rather than at calculate time.
 *
 * The /dev URL is called out specifically: it looks almost identical to /exec
 * but only works for the script's owner while signed in, which produces a
 * baffling HTML response for everyone else.
 */
export function validateWebAppUrl(url) {
  const trimmed = String(url || '').trim();

  if (!trimmed) {
    throw new AppsScriptError('Google Sheet URL is required.', { kind: 'BAD_URL' });
  }
  if (/\/dev(\?|$)/.test(trimmed)) {
    throw new AppsScriptError(
      'This is a /dev URL, which only works for the script owner. Use the /exec URL from Deploy → Manage deployments.',
      { kind: 'BAD_URL', url: trimmed }
    );
  }
  if (/docs\.google\.com\/spreadsheets/.test(trimmed)) {
    throw new AppsScriptError(
      'This is the spreadsheet URL, not the Apps Script web app URL. In the sheet, open Extensions → Apps Script → Deploy and copy the /exec URL.',
      { kind: 'BAD_URL', url: trimmed }
    );
  }
  if (!EXEC_URL_RE.test(trimmed)) {
    throw new AppsScriptError(
      'That does not look like an Apps Script web app URL. Expected https://script.google.com/macros/s/.../exec',
      { kind: 'BAD_URL', url: trimmed }
    );
  }
  return trimmed;
}

/**
 * Turns an HTML (or otherwise unparseable) response into a message that names
 * the actual misconfiguration, since these are the failures users hit most.
 *
 * `status` matters: a 404 means the deployment id in the URL does not resolve,
 * which is a different fix from a script that ran and threw.
 *
 * Order is deliberate. The specific Google phrases are checked first, then the
 * status, and only then the runtime-error heuristic - and that last one is
 * applied ONLY to non-HTML bodies. Google's error pages embed a large amount of
 * minified JavaScript that happens to contain words like "Exception", so
 * matching it against HTML reports a script crash for what is really a missing
 * deployment, sending the user to an execution log that has nothing in it.
 */
function describeNonJson(text, status = null) {
  const isHtml = /^\s*<(!doctype|html)/i.test(text);

  if (/Authorization is required to perform that action/i.test(text)) {
    return "The web app requires authorization. Redeploy with 'Who has access: Anyone'.";
  }
  if (/accounts\.google\.com\/ServiceLogin|ServiceLogin\?|Sign in to continue/i.test(text)) {
    return "Google served a sign-in page. Redeploy with 'Who has access: Anyone'.";
  }
  if (/Sorry, unable to open the file|Access Denied|has not been shared/i.test(text)) {
    return 'Google denied access to the script or spreadsheet. Check the deployment is shared.';
  }
  if (/Script function not found|not found: doGet|not found: doPost/i.test(text)) {
    return 'The deployment has no matching doGet/doPost. Deploy the Code.gs from backend/apps-script/.';
  }
  if (status === 404) {
    return 'Google returned "not found" for this deployment. Check the /exec URL is current - redeploying as a NEW deployment (instead of a new version of the existing one) issues a different URL.';
  }
  if (status === 403) {
    return "Google refused the request. Redeploy with 'Who has access: Anyone'.";
  }
  if (!isHtml && /Exception|TypeError|ReferenceError/i.test(text)) {
    return 'The Apps Script threw an error. Check its execution log in the Apps Script editor.';
  }
  if (isHtml) {
    return 'Apps Script returned an HTML page instead of JSON. Check the /exec URL and that access is set to Anyone.';
  }
  return 'Apps Script returned a response that is not JSON.';
}

/**
 * Single place where every Apps Script request is made, so the redirect,
 * timeout, HTML and {error} handling can't drift between GET and POST.
 */
async function request(url, { method, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let res;
  try {
    res = await fetch(url, {
      method,
      // Apps Script 302s to googleusercontent.com to serve the body.
      redirect: 'follow',
      // text/plain keeps this a CORS-simple request. Irrelevant server-side,
      // but doPost reads e.postData.contents regardless of content type and
      // this matches the proven prototype, so it stays one less variable.
      headers: body ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new AppsScriptError(
        `The spreadsheet did not respond within ${Math.round(timeoutMs / 1000)}s. Large orders can be slow; try again or reduce the number of windows.`,
        { kind: 'TIMEOUT', url }
      );
    }
    throw new AppsScriptError(`Could not reach Google: ${err.message}`, { kind: 'NETWORK', url });
  }

  const text = await res.text();

  // Read the body before trusting the status: Apps Script puts real errors in
  // a 200 body, and its non-2xx responses are HTML worth quoting back.
  if (!res.ok) {
    throw new AppsScriptError(describeNonJson(text, res.status), {
      kind: 'HTTP',
      status: res.status,
      snippet: text.slice(0, 400),
      url
    });
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppsScriptError(describeNonJson(text, res.status), {
      kind: 'NON_JSON',
      status: res.status,
      snippet: text.slice(0, 400),
      url
    });
  }

  // Code.gs signals failure as { error, stack } with a 200 status.
  if (data && data.error) {
    throw new AppsScriptError(String(data.error), { kind: 'SCRIPT_ERROR', status: res.status, url });
  }

  return data;
}

/**
 * GET ?action=structure - the layout blueprint (merges, formulas, fonts,
 * input-column hints). Omit sheetName to get every tab in the workbook.
 *
 * This is the ONLY source of formatting: the POST response carries values
 * only, so the blueprint is what makes a faithful render possible.
 */
export async function fetchStructure(url, { sheetName = null, timeoutMs } = {}) {
  const base = validateWebAppUrl(url);
  const target = new URL(base);
  target.searchParams.set('action', 'structure');
  if (sheetName) target.searchParams.set('sheet', sheetName);

  const started = Date.now();
  const data = await request(target.toString(), { method: 'GET', timeoutMs });

  if (!data || typeof data.sheets !== 'object' || data.sheets === null) {
    throw new AppsScriptError(
      'The web app responded, but not with a sheet structure. Deploy the Code.gs from backend/apps-script/.',
      { kind: 'NON_JSON', snippet: JSON.stringify(data).slice(0, 400), url: base }
    );
  }

  return { sheets: data.sheets, durationMs: Date.now() - started };
}

/**
 * POST the windows and read back the recalculated grid.
 *
 * `windows` must be one entry per physical unit, already expanded by quantity.
 * The sheet's profile lengths use CEILING, which is not additive, so a single
 * row carrying qty=3 yields a different (under-ordered) bar count than three
 * rows. Expansion is the caller's job - see sheetEngine.lineItemsToWindows.
 */
export async function postOrder(
  url,
  { sheetName, orderNo = '', materialSheetName = '', windows = [] },
  { timeoutMs } = {}
) {
  const base = validateWebAppUrl(url);

  if (!sheetName) {
    throw new AppsScriptError('sheetName is required to calculate.', { kind: 'BAD_URL', url: base });
  }
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new AppsScriptError('At least one window with a width and height is required.', {
      kind: 'BAD_URL',
      url: base
    });
  }

  const payload = {
    sheetName,
    orderNo,
    windows: windows.map(w => ({ width: Number(w.width), height: Number(w.height) }))
  };
  // Only send materialSheetName when set: an older deployment ignores it and
  // falls back to its hardcoded default, which is the desired behaviour.
  if (materialSheetName) payload.materialSheetName = materialSheetName;

  const started = Date.now();
  const data = await request(base, { method: 'POST', body: JSON.stringify(payload), timeoutMs });

  if (!data || !data.grid || !Array.isArray(data.grid.values)) {
    throw new AppsScriptError(
      'The spreadsheet did not return a calculated grid.',
      { kind: 'NON_JSON', snippet: JSON.stringify(data).slice(0, 400), url: base }
    );
  }

  return { ...data, durationMs: Date.now() - started };
}
