// Compile-check generated JSX exactly like DynamicComponentRunner does:
// load standalone babel.min.js, transform with presets env+react, then run in a sandbox
// with the __simulateProduction wrapper appended and assert it returns a sane shape.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { buildTemplate } from './_gen.mjs';

// Minimal React stub — we validate the compute path, not rendering.
const React = {
  createElement: () => ({}),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useMemo: (f) => f(),
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useCallback: (f) => f,
};

const BABEL = 'E:/work files/Hari anna/test/test/aran/frontend/public/babel.min.js';
const babelSrc = fs.readFileSync(BABEL, 'utf8');
const sandbox = { window: {}, self: {}, navigator: { userAgent: 'node' }, console };
sandbox.window.self = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(babelSrc, sandbox);
const Babel = sandbox.window.Babel || sandbox.Babel;
if (!Babel) { console.error('Babel standalone failed to load'); process.exit(1); }

const WRAPPER = `
if (typeof exports !== 'undefined') {
  exports.__simulateProduction = function(__input) {
    if (typeof computeWindow !== 'function') throw new Error('no computeWindow');
    var __m = (__input && __input.measurements) || {};
    var __src = (Array.isArray(__m.windows) && __m.windows.length) ? __m.windows : [{id:1,wno:'W1',qty:__m.Qty||1,width:__m.Width||0,height:__m.Height||0}];
    var __windows = __src.map(function(w,i){return {id:w.id||i+1,wno:w.wno||('W'+(i+1)),qty:Number(w.qty||w.Qty||1),width:Number(w.width||w.Width||0),height:Number(w.height||w.Height||0)};});
    var __results = __windows.map(function(w){var o={};for(var k in w)o[k]=w[k];var c=computeWindow(w);for(var k2 in c)o[k2]=c[k2];return o;});
    var __orderTotals = typeof computeTotals==='function'?(computeTotals(__results)||{}):{};
    var __bom = (typeof MATERIALS!=='undefined'&&Array.isArray(MATERIALS))?MATERIALS.map(function(m){var o={};for(var k in m)o[k]=m[k];o.qty=m.linked?(__orderTotals[m.linked]||0):null;return o;}):[];
    return { windows:__windows, results:__results, totals:__orderTotals, bom:__bom };
  };
}
`;

export function compileCheck(cfg) {
  const jsx = buildTemplate(cfg);
  // strip import lines (runtime resolves them via require shim); keep code body
  let clean = jsx.split('\n').filter((l) => !/^```/.test(l.trim())).join('\n').trim();
  clean += WRAPPER;
  let compiled;
  try {
    compiled = Babel.transform(clean, { presets: ['env', 'react'], plugins: [] }).code;
  } catch (e) {
    return { ok: false, stage: 'transform', err: e.message };
  }
  const exportsObj = {};
  const require = (name) => {
    const n = name.toLowerCase();
    if (n === 'react') return React;
    if (n === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (n === 'react-router-dom') return {};
    throw new Error('module ' + name + ' not available');
  };
  try {
    const fn = new Function('React', 'require', 'exports', compiled);
    fn(React, require, exportsObj);
  } catch (e) {
    return { ok: false, stage: 'run', err: e.message };
  }
  if (typeof exportsObj.default !== 'function') return { ok: false, stage: 'export', err: 'no default component' };
  // run a simulation to ensure no runtime throw in compute path
  try {
    const w = cfg.verify?.windows?.[0] || { width: 1000, height: 1000, qty: 1 };
    const sim = exportsObj.__simulateProduction({ measurements: { Width: w.width, Height: w.height, Qty: w.qty } });
    if (!sim || !Array.isArray(sim.results)) return { ok: false, stage: 'simulate', err: 'bad sim shape' };
  } catch (e) {
    return { ok: false, stage: 'simulate', err: e.message };
  }
  return { ok: true };
}

// CLI: node _compilecheck.mjs <configFile> — only when run directly, not when imported
const isMain = import.meta.url === 'file://' + path.resolve(process.argv[1] || '').replace(/\\/g, '/');
if (isMain && process.argv[2]) {
  const mod = await import('file://' + path.resolve(process.argv[2]));
  let bad = 0;
  for (const cfg of mod.CONFIGS) {
    const r = compileCheck(cfg);
    if (r.ok) console.log(`✓ COMPILE ${cfg.code} ${cfg.title}`);
    else { console.log(`✗ COMPILE ${cfg.code} [${r.stage}] ${r.err}`); bad++; }
  }
  process.exit(bad ? 3 : 0);
}
