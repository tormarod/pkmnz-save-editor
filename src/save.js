// A loaded save: the 15 Marshal streams, plus path addressing, a lazy tree
// view for the raw browser, and serialization that refuses to produce a file it
// cannot read back.
//
// No filesystem access: a Save is built from bytes the caller already has, so
// this module works unchanged in the browser and in Node.

import {
  loadAll, dumpAll, strToJs, jsToStr, floatText, floatToJs, jsToFloat, RStr,
  bignumToJs, bignumIsExact,
} from './marshal.js';
import { SECTIONS, fieldInfo } from './schema.js';
import { nameOf } from './labels.js';

export class Save {
  /**
   * @param {string} file  display name, e.g. "Game.rxdata"
   * @param {Uint8Array} bytes  the raw save
   */
  constructor(file, bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('Save needs the file bytes as a Uint8Array');
    }
    this.file = file;
    this.original = bytes;
    this.streams = loadAll(bytes).map((s) => s.value);
    if (this.streams.length !== SECTIONS.length) {
      throw new Error(
        `expected ${SECTIONS.length} Marshal streams, found ${this.streams.length} ` +
        `- this may not be a Pokemon Z save`,
      );
    }
  }

  section(key) {
    const i = SECTIONS.findIndex((s) => s.key === key);
    return i === -1 ? undefined : this.streams[i];
  }

  setSection(key, value) {
    const i = SECTIONS.findIndex((s) => s.key === key);
    if (i === -1) throw new Error(`no section '${key}'`);
    this.streams[i] = value;
  }

  // --- path addressing -------------------------------------------------------
  // A path is a list of steps: {k:'s',i} stream, {k:'v',name} ivar,
  // {k:'i',i} array index, {k:'hk'|'hv',i} hash key/value, {k:'u'} inner value.

  /** Resolve to { get(), set(v), parent, step } so callers can read or write. */
  locate(path) {
    let holder = { get: () => this.streams, set: () => { throw new Error('cannot replace the root'); } };
    let cur = this.streams;
    for (const step of path) {
      const parent = cur;
      switch (step.k) {
        case 's':
          holder = { get: () => parent[step.i], set: (v) => { parent[step.i] = v; } };
          break;
        case 'v': {
          const pair = parent.ivars?.find(([n]) => n === step.name);
          if (!pair) throw new Error(`no ivar ${step.name} on ${parent.cls || parent.t}`);
          holder = { get: () => pair[1], set: (v) => { pair[1] = v; } };
          break;
        }
        case 'i':
          if (!parent.items) throw new Error('not an array');
          holder = { get: () => parent.items[step.i], set: (v) => { parent.items[step.i] = v; } };
          break;
        case 'hk':
          holder = { get: () => parent.entries[step.i][0], set: (v) => { parent.entries[step.i][0] = v; } };
          break;
        case 'hv':
          holder = { get: () => parent.entries[step.i][1], set: (v) => { parent.entries[step.i][1] = v; } };
          break;
        case 'u':
          holder = { get: () => parent.value, set: (v) => { parent.value = v; } };
          break;
        default:
          throw new Error(`bad path step '${step.k}'`);
      }
      cur = holder.get();
    }
    return holder;
  }

  get(path) { return this.locate(path).get(); }

  /**
   * Write a scalar, keeping the Marshal type that is already there so an edit
   * cannot silently turn a Fixnum into a String.
   */
  set(path, raw) {
    const h = this.locate(path);
    const old = h.get();
    h.set(coerce(old, raw));
    return h.get();
  }

  // --- writing ---------------------------------------------------------------

  /**
   * Serialize the save and verify the result parses back into a full set of
   * streams. Never returns bytes the game could not load.
   */
  serialize() {
    const out = dumpAll(this.streams);
    const check = loadAll(out); // never hand the game something we cannot re-read
    if (check.length !== SECTIONS.length) {
      throw new Error(`refusing to produce a save: re-read gave ${check.length} streams`);
    }
    return out;
  }

  /** True when the in-memory state no longer matches the bytes we loaded. */
  isDirty() {
    const out = dumpAll(this.streams);
    if (out.length !== this.original.length) return true;
    for (let i = 0; i < out.length; i++) if (out[i] !== this.original[i]) return true;
    return false;
  }

  /** Mark the current bytes as the saved baseline. */
  markSaved(bytes) {
    this.original = bytes ?? this.serialize();
  }
}

/** Keep the existing Marshal type when assigning a new value from the UI. */
function coerce(old, raw) {
  if (old === null || old === undefined) {
    if (raw === null) return null;
    if (typeof raw === 'boolean' || typeof raw === 'number') return raw;
    return jsToStr(String(raw));
  }
  if (typeof old === 'boolean') return raw === true || raw === 'true';
  if (typeof old === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`'${raw}' is not a number`);
    if (!Number.isInteger(n)) throw new Error(`'${raw}' must be a whole number (this field is a Fixnum)`);
    return n;
  }
  if (old.t === 'str') return RStr(jsToStr(String(raw)).bytes);
  if (old.t === 'float') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`'${raw}' is not a number`);
    return jsToFloat(n);
  }
  if (old.t === 'sym') return { t: 'sym', name: String(raw) };
  if (old.t === 'bignum') {
    const n = Number(raw);
    if (!Number.isInteger(n)) throw new Error(`'${raw}' must be a whole number`);
    // Hand back a plain number: the writer promotes it to a Bignum again if it
    // is still too big for a Fixnum, and emits a Fixnum if it now fits.
    return n;
  }
  throw new Error(`this field holds a ${old.t}; edit it through the raw tree instead`);
}

// --- tree view ---------------------------------------------------------------

const MAX_CHILDREN = 500;

/** One-line preview of a value, for a collapsed tree row. */
export function preview(v) {
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  switch (v.t) {
    case 'str': {
      const s = strToJs(v);
      return JSON.stringify(s.length > 60 ? `${s.slice(0, 60)}...` : s);
    }
    case 'sym': return `:${v.name}`;
    case 'float': return floatText(v);
    case 'bignum': return bignumIsExact(v) ? String(bignumToJs(v)) : `Bignum(${v.words.length * 8} bits)`;
    case 'array': return `Array(${v.items.length})`;
    case 'hash': return `Hash(${v.entries.length})`;
    case 'obj': return `${v.cls}`;
    case 'userdef': return `${v.cls} (${v.bytes.length} raw bytes)`;
    case 'usrmarshal': return v.cls;
    case 'struct': return `Struct ${v.cls}`;
    case 'class': return `Class ${v.name}`;
    case 'module': return `Module ${v.name}`;
    case 'regexp': return 'Regexp';
    default: return v.t;
  }
}

export function typeOf(v) {
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  return v.t;
}

/** Can the UI edit this in a plain text box? */
export function isScalar(v) {
  const t = typeOf(v);
  if (t === 'bignum') return bignumIsExact(v); // trainer IDs and the like
  return t === 'nil' || t === 'bool' || t === 'int' || t === 'str' || t === 'float' || t === 'sym';
}

export function editValue(v) {
  if (v === null) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v.t === 'str') return strToJs(v);
  if (v.t === 'float') return floatToJs(v);
  if (v.t === 'sym') return v.name;
  if (v.t === 'bignum') return bignumIsExact(v) ? bignumToJs(v) : null;
  return null;
}

/** Children of the node at `path`, for lazy tree expansion. */
export function children(save, path) {
  const v = save.get(path);
  const out = [];
  const push = (step, label, val, extra = {}) =>
    out.push({
      step,
      label,
      type: typeOf(val),
      preview: preview(val),
      scalar: isScalar(val),
      value: isScalar(val) ? editValue(val) : null,
      expandable: hasChildren(val),
      ...extra,
    });

  if (v === undefined) return out;

  if (Array.isArray(v)) {
    // the root: the list of streams
    v.forEach((s, i) => push({ k: 's', i }, `${i}  ${SECTIONS[i].name}`, s, { note: SECTIONS[i].desc }));
    return out;
  }

  if (v.t === 'obj' || v.t === 'struct') {
    for (const [name, val] of v.ivars) {
      const info = fieldInfo(v.cls, name);
      const extra = { note: info.note };
      if (info.kind && typeof val === 'number') {
        const nm = nameOf(info.kind, val);
        if (nm) extra.resolved = nm;
      }
      push({ k: 'v', name }, info.label, val, extra);
    }
    return out;
  }

  if (v.t === 'array') {
    const n = Math.min(v.items.length, MAX_CHILDREN);
    for (let i = 0; i < n; i++) push({ k: 'i', i }, `[${i}]`, v.items[i]);
    if (v.items.length > n) out.push({ truncated: v.items.length - n });
    return out;
  }

  if (v.t === 'hash') {
    const n = Math.min(v.entries.length, MAX_CHILDREN);
    for (let i = 0; i < n; i++) {
      const [k, val] = v.entries[i];
      push({ k: 'hv', i }, preview(k), val);
    }
    if (v.entries.length > n) out.push({ truncated: v.entries.length - n });
    return out;
  }

  if (v.t === 'usrmarshal') {
    push({ k: 'u' }, 'value', v.value);
    return out;
  }

  return out;
}

export function hasChildren(v) {
  if (v === null || typeof v !== 'object') return false;
  if (v.t === 'obj' || v.t === 'struct') return v.ivars.length > 0;
  if (v.t === 'array') return v.items.length > 0;
  if (v.t === 'hash') return v.entries.length > 0;
  if (v.t === 'usrmarshal') return true;
  return false;
}

export { strToJs, floatText };
