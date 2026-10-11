/**
 * Safe arithmetic expression engine for calculated columns.
 * No eval / Function constructor is used: the input is tokenised and parsed
 * into an AST whose only capabilities are arithmetic, comparisons, a fixed set
 * of math functions, and references to existing numeric columns.
 *
 * Syntax examples:
 *   [Unit Price] * Quantity
 *   round([Revenue] / [Units], 2)
 *   if([Discount] > 0, [Revenue] * (1 - [Discount]), [Revenue])
 */
import { parseNumber } from './dataUtils.js';

const FUNCTIONS = {
  abs: { arity: 1, fn: (a) => Math.abs(a) },
  round: { arity: [1, 2], fn: (a, d = 0) => { const m = 10 ** d; return Math.round(a * m) / m; } },
  floor: { arity: 1, fn: (a) => Math.floor(a) },
  ceil: { arity: 1, fn: (a) => Math.ceil(a) },
  sqrt: { arity: 1, fn: (a) => Math.sqrt(a) },
  log: { arity: 1, fn: (a) => Math.log(a) },
  exp: { arity: 1, fn: (a) => Math.exp(a) },
  pow: { arity: 2, fn: (a, b) => a ** b },
  min: { arity: [2, 10], fn: (...a) => Math.min(...a) },
  max: { arity: [2, 10], fn: (...a) => Math.max(...a) },
  if: { arity: 3, fn: (c, a, b) => (c ? a : b) },
};

const MAX_LENGTH = 500;

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end === -1) throw new Error('Missing closing ] in column reference.');
      tokens.push({ t: 'ref', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%^<>!'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i += 1; continue; }
    if (ch === '(') { tokens.push({ t: 'lp' }); i += 1; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i += 1; continue; }
    if (ch === ',') { tokens.push({ t: 'comma' }); i += 1; continue; }
    throw new Error(`Unexpected character "${ch}".`);
  }
  return tokens;
}

/**
 * Compiles an expression against the known column names.
 * Throws an Error with a user-friendly message on invalid input.
 * @returns {{ refs: string[], evaluate: (getValue: (name: string) => any) => number|null }}
 */
export function compileExpression(src, columnNames) {
  if (typeof src !== 'string' || !src.trim()) throw new Error('Enter an expression.');
  if (src.length > MAX_LENGTH) throw new Error(`Expression is longer than ${MAX_LENGTH} characters.`);
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

  function parseOr() {
    let left = parseAnd();
    while (isOp('||')) { pos += 1; left = { k: 'bin', op: '||', l: left, r: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseCmp();
    while (isOp('&&')) { pos += 1; left = { k: 'bin', op: '&&', l: left, r: parseCmp() }; }
    return left;
  }
  function parseCmp() {
    let left = parseAdd();
    const ops = ['<', '>', '<=', '>=', '==', '!='];
    while (peek() && peek().t === 'op' && ops.includes(peek().v)) {
      const op = tokens[pos++].v;
      left = { k: 'bin', op, l: left, r: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      left = { k: 'bin', op, l: left, r: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parsePow();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v;
      left = { k: 'bin', op, l: left, r: parsePow() };
    }
    return left;
  }
  function parsePow() {
    const base = parseUnary();
    if (isOp('^')) { pos += 1; return { k: 'bin', op: '^', l: base, r: parsePow() }; }
    return base;
  }
  function parseUnary() {
    if (isOp('-') || isOp('+')) {
      const op = tokens[pos++].v;
      return { k: 'un', op, a: parseUnary() };
    }
    if (isOp('!')) { pos += 1; return { k: 'un', op: '!', a: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const tok = tokens[pos];
    if (!tok) throw new Error('The expression ends unexpectedly.');
    if (tok.t === 'num') { pos += 1; return { k: 'num', v: tok.v }; }
    if (tok.t === 'ref') { pos += 1; return { k: 'ref', name: tok.v }; }
    if (tok.t === 'lp') {
      pos += 1;
      const inner = parseOr();
      if (!peek() || peek().t !== 'rp') throw new Error('Missing closing parenthesis.');
      pos += 1;
      return inner;
    }
    if (tok.t === 'id') {
      pos += 1;
      if (peek() && peek().t === 'lp') {
        const fname = tok.v.toLowerCase();
        const def = FUNCTIONS[fname];
        if (!def) throw new Error(`Unknown function "${tok.v}". Allowed: ${Object.keys(FUNCTIONS).join(', ')}.`);
        pos += 1;
        const args = [];
        if (!(peek() && peek().t === 'rp')) {
          args.push(parseOr());
          while (peek() && peek().t === 'comma') { pos += 1; args.push(parseOr()); }
        }
        if (!peek() || peek().t !== 'rp') throw new Error(`Missing closing parenthesis after ${tok.v}(.`);
        pos += 1;
        const [minA, maxA] = Array.isArray(def.arity) ? def.arity : [def.arity, def.arity];
        if (args.length < minA || args.length > maxA) {
          throw new Error(`${fname}() expects ${minA === maxA ? minA : `${minA}-${maxA}`} argument(s).`);
        }
        return { k: 'call', fn: fname, args };
      }
      // bare identifier = column reference (only if it matches a column name)
      return { k: 'ref', name: tok.v };
    }
    throw new Error('Unexpected token in expression.');
  }

  const ast = parseOr();
  if (pos < tokens.length) throw new Error('Unexpected extra input in expression.');

  const refs = [];
  (function walk(node) {
    if (!node) return;
    if (node.k === 'ref') {
      if (!columnNames.includes(node.name)) {
        throw new Error(`Unknown column "${node.name}". Use [Column Name] for names with spaces.`);
      }
      if (!refs.includes(node.name)) refs.push(node.name);
    }
    if (node.k === 'bin') { walk(node.l); walk(node.r); }
    if (node.k === 'un') walk(node.a);
    if (node.k === 'call') node.args.forEach(walk);
  })(ast);

  function evalNode(node, getValue) {
    switch (node.k) {
      case 'num': return node.v;
      case 'ref': {
        const raw = getValue(node.name);
        if (typeof raw === 'number') return raw;
        const n = parseNumber(raw);
        return Number.isNaN(n) ? NaN : n;
      }
      case 'un': {
        const a = evalNode(node.a, getValue);
        if (node.op === '-') return -a;
        if (node.op === '!') return a ? 0 : 1;
        return a;
      }
      case 'call': {
        const args = node.args.map((x) => evalNode(x, getValue));
        return FUNCTIONS[node.fn].fn(...args);
      }
      case 'bin': {
        const a = evalNode(node.l, getValue);
        const b = evalNode(node.r, getValue);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? NaN : a / b;
          case '%': return b === 0 ? NaN : a % b;
          case '^': return a ** b;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '==': return a === b ? 1 : 0;
          case '!=': return a !== b ? 1 : 0;
          case '&&': return a && b ? 1 : 0;
          case '||': return a || b ? 1 : 0;
          default: return NaN;
        }
      }
      default: return NaN;
    }
  }

  return {
    refs,
    /** Returns a finite number, or null when inputs are missing or the result is undefined. */
    evaluate(getValue) {
      const v = evalNode(ast, getValue);
      return Number.isFinite(v) ? v : null;
    },
  };
}

export const EXPRESSION_FUNCTIONS = Object.keys(FUNCTIONS);
