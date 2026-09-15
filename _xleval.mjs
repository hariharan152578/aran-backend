// Minimal Excel formula evaluator — an INDEPENDENT oracle.
// Reads a sheet's actual formula strings, injects sample input cells, and computes
// any target cell by recursive descent. Supports the idioms used in these workbooks:
//   IF, CEILING, FLOOR, SUM, AND, OR, COUNTA, COUNT, ROUND, ROUNDUP, MAX, MIN, IFERROR, ABS
//   cell refs (A1), ranges (A1:B9), + - * / , comparisons, "" strings, numbers, #REF!.
import xlsx from 'xlsx';

const colToNum = (c) => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
const numToCol = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; } return s; };

export class Sheet {
  constructor(ws) { this.ws = ws; this.cache = new Map(); this.overrides = new Map(); }
  set(addr, val) { this.overrides.set(addr, val); this.cache.delete(addr); }
  reset() { this.overrides.clear(); this.cache.clear(); }
  raw(addr) {
    if (this.overrides.has(addr)) return { v: this.overrides.get(addr) };
    return this.ws[addr];
  }
  // returns number | string | '' (empty)
  eval(addr) {
    if (this.cache.has(addr)) return this.cache.get(addr);
    const cell = this.raw(addr);
    let out;
    if (cell === undefined || cell === null) out = '';
    else if (this.overrides.has(addr)) out = cell.v;
    else if (cell.f !== undefined) out = this.evalExpr(cell.f, addr);
    else out = (cell.v === undefined ? '' : cell.v);
    this.cache.set(addr, out);
    return out;
  }
  evalExpr(formula, ctxAddr) {
    const p = new Parser(formula, this, ctxAddr);
    return p.parse();
  }
}

const ERR = Symbol('XL_ERR');

class Parser {
  constructor(src, sheet, ctx) { this.s = src; this.i = 0; this.sheet = sheet; this.ctx = ctx; }
  parse() { const v = this.expr(); this.ws(); if (this.i < this.s.length) throw new Error('trailing @' + this.i + ' in ' + this.s); return v; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  peek() { this.ws(); return this.s[this.i]; }
  // expression: comparison
  expr() { return this.comparison(); }
  comparison() {
    let l = this.addsub();
    for (;;) {
      this.ws();
      const two = this.s.substr(this.i, 2);
      let op = null;
      if (two === '<=' || two === '>=' || two === '<>') { op = two; this.i += 2; }
      else { const c = this.s[this.i]; if (c === '=' || c === '<' || c === '>') { op = c; this.i++; } }
      if (!op) break;
      const r = this.addsub();
      l = this.compare(op, l, r);
    }
    return l;
  }
  compare(op, a, b) {
    // Excel: blank compares as 0 for numeric, but here ranges already give numbers/strings.
    const na = a === '' ? 0 : a, nb = b === '' ? 0 : b;
    switch (op) {
      case '=': return a === b ? true : (na === nb);
      case '<>': return a !== b;
      case '<': return na < nb; case '>': return na > nb;
      case '<=': return na <= nb; case '>=': return na >= nb;
    }
  }
  addsub() {
    let l = this.muldiv();
    for (;;) {
      const c = this.peek();
      if (c === '+' || c === '-') { this.i++; const r = this.muldiv(); l = this.arith(c, l, r); }
      else break;
    }
    return l;
  }
  muldiv() {
    let l = this.unary();
    for (;;) {
      const c = this.peek();
      if (c === '*' || c === '/') { this.i++; const r = this.unary(); l = this.arith(c, l, r); }
      else break;
    }
    return l;
  }
  arith(op, a, b) {
    if (a === ERR || b === ERR) return ERR;
    const na = (a === '' || a === true) ? (a === true ? 1 : 0) : Number(a);
    const nb = (b === '' || b === true) ? (b === true ? 1 : 0) : Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return ERR;
    switch (op) { case '+': return na + nb; case '-': return na - nb; case '*': return na * nb; case '/': return nb === 0 ? ERR : na / nb; }
  }
  unary() {
    const c = this.peek();
    if (c === '-') { this.i++; const v = this.unary(); return this.arith('-', 0, v); }
    if (c === '+') { this.i++; return this.unary(); }
    return this.primary();
  }
  primary() {
    this.ws();
    const c = this.s[this.i];
    if (c === '(') { this.i++; const v = this.expr(); this.ws(); if (this.s[this.i] === ')') this.i++; return v; }
    if (c === '"') return this.string();
    if (c === '#') { // error literal like #REF!
      const m = /^#[A-Z]+!?/.exec(this.s.slice(this.i)); if (m) { this.i += m[0].length; return ERR; }
    }
    if (/[A-Za-z_]/.test(c)) return this.identifier();
    if (/[0-9.]/.test(c)) return this.number();
    throw new Error('unexpected char "' + c + '" @' + this.i + ' in ' + this.s);
  }
  string() {
    this.i++; let out = '';
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === '"') { if (this.s[this.i + 1] === '"') { out += '"'; this.i += 2; continue; } this.i++; break; }
      out += ch; this.i++;
    }
    return out;
  }
  number() {
    let j = this.i;
    while (j < this.s.length && /[0-9.]/.test(this.s[j])) j++;
    // scientific
    if (this.s[j] === 'e' || this.s[j] === 'E') { j++; if (this.s[j] === '+' || this.s[j] === '-') j++; while (j < this.s.length && /[0-9]/.test(this.s[j])) j++; }
    const v = Number(this.s.slice(this.i, j)); this.i = j; return v;
  }
  identifier() {
    let j = this.i;
    while (j < this.s.length && /[A-Za-z0-9_.]/.test(this.s[j])) j++;
    let name = this.s.slice(this.i, j);
    this.i = j;
    this.ws();
    // sheet-qualified ref like 'Sheet'!A1 handled by caller stripping; here bare names
    if (this.s[this.i] === '(') { this.i++; const args = this.args(); this.ws(); if (this.s[this.i] === ')') this.i++; return this.callFn(name.toUpperCase(), args); }
    // cell ref or range
    if (this.s[this.i] === ':') {
      this.i++;
      this.ws();
      let k = this.i; while (k < this.s.length && /[A-Za-z0-9_$]/.test(this.s[k])) k++;
      const end = this.s.slice(this.i, k); this.i = k;
      return this.range(name, end);
    }
    if (/^\$?[A-Z]+\$?[0-9]+$/.test(name)) return this.cellVal(name.replace(/\$/g, ''));
    if (name.toUpperCase() === 'TRUE') return true;
    if (name.toUpperCase() === 'FALSE') return false;
    throw new Error('unknown identifier ' + name + ' in ' + this.s);
  }
  args() {
    const out = [];
    this.ws();
    if (this.s[this.i] === ')') return out;
    for (;;) {
      out.push(this.expr());
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      break;
    }
    return out;
  }
  cellVal(addr) { return this.sheet.eval(addr); }
  range(start, end) {
    const m1 = /^\$?([A-Z]+)\$?([0-9]+)$/.exec(start), m2 = /^\$?([A-Z]+)\$?([0-9]+)$/.exec(end);
    if (!m1 || !m2) throw new Error('bad range ' + start + ':' + end);
    const c1 = colToNum(m1[1]), r1 = +m1[2], c2 = colToNum(m2[1]), r2 = +m2[2];
    const cells = [];
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        cells.push(this.sheet.eval(numToCol(c) + r));
    return cells; // array marker
  }
  callFn(name, args) {
    const num = (x) => (x === '' || x === false) ? 0 : (x === true ? 1 : Number(x));
    const flat = (a) => Array.isArray(a) ? a : [a];
    switch (name) {
      case 'IF': { const cond = args[0]; const t = cond === true || (cond !== false && cond !== '' && num(cond) !== 0 && cond !== ERR); return t ? args[1] : (args.length > 2 ? args[2] : false); }
      case 'CEILING': { const x = num(args[0]), step = num(args[1]); if (args[0] === ERR) return ERR; if (step === 0) return 0; return Math.ceil(x / step) * step; }
      case 'FLOOR': { const x = num(args[0]), step = num(args[1]); if (step === 0) return 0; return Math.floor(x / step) * step; }
      case 'ROUNDUP': { const x = num(args[0]), d = num(args[1]); const f = Math.pow(10, d); return Math.ceil(x * f) / f; }
      case 'ROUND': { const x = num(args[0]), d = num(args[1]); const f = Math.pow(10, d); return Math.round(x * f) / f; }
      case 'SUM': { let s = 0; for (const a of args) for (const v of flat(a)) { if (v === ERR) return ERR; if (v !== '' && v !== false) s += num(v); } return s; }
      case 'COUNTA': { let n = 0; for (const a of args) for (const v of flat(a)) if (v !== '' && v !== false && v !== null && v !== undefined) n++; return n; }
      case 'COUNT': { let n = 0; for (const a of args) for (const v of flat(a)) if (v !== '' && typeof v === 'number' && !Number.isNaN(v)) n++; return n; }
      case 'AND': { for (const a of args) { const v = a; if (v === false || v === '' || num(v) === 0) return false; } return true; }
      case 'OR': { for (const a of args) { const v = a; if (v === true || (v !== '' && num(v) !== 0)) return true; } return false; }
      case 'MAX': { let m = -Infinity; for (const a of args) for (const v of flat(a)) if (v !== '') m = Math.max(m, num(v)); return m === -Infinity ? 0 : m; }
      case 'MIN': { let m = Infinity; for (const a of args) for (const v of flat(a)) if (v !== '') m = Math.min(m, num(v)); return m === Infinity ? 0 : m; }
      case 'ABS': return Math.abs(num(args[0]));
      case 'IFERROR': return (args[0] === ERR) ? args[1] : args[0];
      case 'TODAY': return 46000;
      case 'INT': return Math.floor(num(args[0]));
      default: throw new Error('unsupported fn ' + name + ' in ' + this.s);
    }
  }
}

// Strip sheet qualifiers ('Sheet Name'!A1 or Sheet!A1) -> A1 (single-sheet model).
// Only valid because these workbooks self-reference one production sheet.
export function stripSheetQual(f) {
  return f
    .replace(/'[^']*'!/g, '')
    .replace(/[A-Za-z0-9_]+!/g, '');
}

export function loadSheet(path, sheetName) {
  const wb = xlsx.readFile(path, { cellFormula: true });
  const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
  // pre-strip sheet qualifiers in formulas
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const c = ws[addr];
    if (c.f) c.f = stripSheetQual(c.f);
  }
  return { wb, ws, sheet: new Sheet(ws), ERR };
}
export { ERR };
