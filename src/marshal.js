// Ruby Marshal 4.8 codec (the dialect RGSS / Ruby 1.8 emits).
//
// Design goal: a *byte-identical* round trip on untouched data. The reader and
// writer walk the object graph in the same order, so the symbol table and the
// object-link table are rebuilt in exactly the same sequence as the original.
// test/roundtrip.js asserts this against every real file in the game.
//
// Value model (plain JS, directly editable):
//   nil        -> null
//   true/false -> boolean
//   Fixnum     -> number
//   everything else -> a tagged object, see below
// Object identity carries Marshal links: if the same JS object appears twice in
// the graph, the writer emits a link the second time, just as Ruby does.

export const MAJOR = 4;
export const MINOR = 8;

// RGSS runs 32-bit Ruby 1.8, where a Fixnum is 31-bit signed (one bit is the
// tag). Anything outside this range MUST be written as a Bignum: Marshal's
// reader does a raw INT2FIX on a 'i' payload, so a larger value silently
// overflows into a negative number. That is what made Time.at(@timeReceived)
// raise "time must be positive" on an injected Pokemon.
export const FIXNUM_MAX = 1073741823; // 2**30 - 1
export const FIXNUM_MIN = -1073741824; // -(2**30)

// --- tagged constructors -----------------------------------------------------

export const RSym = (name) => ({ t: 'sym', name });
export const RStr = (bytes) => ({ t: 'str', bytes });
// Ruby 1.8 Floats are "62.207176384839649\0\xb1\xe5": a printable form, a NUL,
// then raw mantissa bits for extra precision. Those trailing bytes are not
// valid UTF-8, so keep the payload as bytes and only decode for display.
export const RFloat = (bytes) => ({ t: 'float', bytes });
export const RBignum = (sign, words) => ({ t: 'bignum', sign, words });
export const RArray = (items) => ({ t: 'array', items });
export const RHash = (entries, dflt) => ({ t: 'hash', entries, default: dflt });
export const RObject = (cls, ivars) => ({ t: 'obj', cls, ivars });

/** Read one ivar off an obj/struct node, or undefined if it is absent (or `o` is nil). */
export function getIvar(o, name) {
  return o && o.ivars ? o.ivars.find(([k]) => k === name)?.[1] : undefined;
}
/** Set an ivar on an obj/struct node, creating it (in initialize order) if it isn't there yet. */
export function setIvar(o, name, value) {
  const pair = o.ivars.find(([k]) => k === name);
  if (pair) pair[1] = value;
  else o.ivars.push([name, value]);
}

const td = new TextDecoder('utf-8', { fatal: false });
const te = new TextEncoder();

/** Decode a Ruby String's bytes as UTF-8 for display. */
export function strToJs(v) {
  if (!v || v.t !== 'str') return null;
  return td.decode(v.bytes);
}
/** Build a Ruby String from a JS string (UTF-8). */
export function jsToStr(s) {
  return RStr(te.encode(s));
}

/** The printable part of a Marshal Float (everything before the NUL). */
export function floatText(v) {
  const nul = v.bytes.indexOf(0);
  return td.decode(nul === -1 ? v.bytes : v.bytes.subarray(0, nul));
}
/** A Marshal Float as a JS number. */
export function floatToJs(v) {
  const s = floatText(v);
  if (s === 'inf') return Infinity;
  if (s === '-inf') return -Infinity;
  if (s === 'nan') return NaN;
  return Number(s);
}
/** A Marshal Bignum as a JS number (exact up to 2^53). */
export function bignumToJs(v) {
  let n = 0;
  for (let i = v.words.length - 1; i >= 0; i--) n = n * 256 + v.words[i];
  return v.sign === '-' ? -n : n;
}
/** True when a Bignum fits in a JS integer without losing precision. */
export function bignumIsExact(v) {
  return Number.isSafeInteger(bignumToJs(v));
}

/**
 * Build a Marshal Float from a JS number. Drops the extra precision bytes,
 * which is exactly what Ruby does when it re-dumps a value it computed.
 */
export function jsToFloat(n) {
  if (n === Infinity) return RFloat(te.encode('inf'));
  if (n === -Infinity) return RFloat(te.encode('-inf'));
  if (Number.isNaN(n)) return RFloat(te.encode('nan'));
  return RFloat(te.encode(String(n)));
}

// --- reader ------------------------------------------------------------------

class Reader {
  constructor(buf, pos) {
    this.b = buf;
    this.p = pos;
    this.symbols = [];
    this.objects = [];
  }

  byte() {
    if (this.p >= this.b.length) throw new Error(`unexpected end of stream at ${this.p}`);
    return this.b[this.p++];
  }

  // Mirrors Ruby's r_long: a signed 32-bit long, so build the 4 bytes
  // explicitly (0x00-filled when positive, 0xff-filled when negative) and read
  // the result back as a little-endian int32.
  long() {
    let c = this.byte();
    if (c & 0x80) c -= 256; // signed
    if (c === 0) return 0;
    if (c > 4) return c - 5;
    if (c < -4) return c + 5;
    const len = Math.abs(c);
    const w = new Uint8Array(4).fill(c > 0 ? 0x00 : 0xff);
    for (let i = 0; i < len; i++) w[i] = this.byte();
    return new DataView(w.buffer).getInt32(0, true);
  }

  bytes() {
    const n = this.long();
    const out = this.b.subarray(this.p, this.p + n);
    if (out.length !== n) throw new Error(`truncated byte run at ${this.p}`);
    this.p += n;
    return out;
  }

  // Register before reading the body so self-referential graphs resolve.
  entry(v) {
    this.objects.push(v);
    return v;
  }

  symbol() {
    const t = this.byte();
    if (t === 0x3a /* : */) {
      const name = td.decode(this.bytes());
      this.symbols.push(name);
      return name;
    }
    if (t === 0x3b /* ; */) {
      const i = this.long();
      if (i < 0 || i >= this.symbols.length) throw new Error(`bad symlink ${i} at ${this.p}`);
      return this.symbols[i];
    }
    throw new Error(`expected a symbol at ${this.p - 1}, got '${String.fromCharCode(t)}'`);
  }

  ivars(target) {
    const n = this.long();
    for (let i = 0; i < n; i++) {
      const name = this.symbol();
      target.push([name, this.value()]);
    }
  }

  value() {
    const t = this.byte();
    switch (String.fromCharCode(t)) {
      case '0': return null;
      case 'T': return true;
      case 'F': return false;
      case 'i': return this.long();

      case ':':
      case ';': {
        this.p--; // let symbol() re-read the tag
        return RSym(this.symbol());
      }

      case '@': {
        const i = this.long();
        if (i < 0 || i >= this.objects.length) throw new Error(`bad object link ${i} at ${this.p}`);
        return this.objects[i];
      }

      case '"': return this.entry(RStr(this.bytes().slice()));

      case 'f': return this.entry(RFloat(this.bytes().slice()));

      case 'l': {
        const sign = String.fromCharCode(this.byte());
        const n = this.long();
        const words = this.b.subarray(this.p, this.p + n * 2).slice();
        this.p += n * 2;
        return this.entry(RBignum(sign, words));
      }

      case '[': {
        const v = this.entry(RArray([]));
        const n = this.long();
        for (let i = 0; i < n; i++) v.items.push(this.value());
        return v;
      }

      case '{': {
        const v = this.entry(RHash([], undefined));
        const n = this.long();
        for (let i = 0; i < n; i++) v.entries.push([this.value(), this.value()]);
        return v;
      }

      case '}': {
        const v = this.entry(RHash([], undefined));
        const n = this.long();
        for (let i = 0; i < n; i++) v.entries.push([this.value(), this.value()]);
        v.default = this.value();
        return v;
      }

      case 'o': {
        const cls = this.symbol();
        const v = this.entry(RObject(cls, []));
        this.ivars(v.ivars);
        return v;
      }

      case 'u': {
        const cls = this.symbol();
        const n = this.long();
        const data = this.b.subarray(this.p, this.p + n).slice();
        this.p += n;
        return this.entry({ t: 'userdef', cls, bytes: data });
      }

      case 'U': {
        const cls = this.symbol();
        const v = this.entry({ t: 'usrmarshal', cls, value: null });
        v.value = this.value();
        return v;
      }

      case 'S': {
        const cls = this.symbol();
        const v = this.entry({ t: 'struct', cls, ivars: [] });
        this.ivars(v.ivars);
        return v;
      }

      case 'c': return this.entry({ t: 'class', name: td.decode(this.bytes()) });
      case 'm': return this.entry({ t: 'module', name: td.decode(this.bytes()) });

      case '/': {
        const v = this.entry({ t: 'regexp', bytes: null, options: 0 });
        v.bytes = this.bytes().slice();
        v.options = this.byte();
        return v;
      }

      case 'e': {
        const mod = this.symbol();
        return { t: 'extended', mod, value: this.value() };
      }

      case 'C': {
        const cls = this.symbol();
        return { t: 'uclass', cls, value: this.value() };
      }

      case 'I': {
        // Ruby 1.9+ ivar wrapper. RGSS does not emit it, but tolerate it.
        const inner = this.value();
        const extra = [];
        this.ivars(extra);
        return extra.length ? { t: 'ivar', value: inner, ivars: extra } : inner;
      }

      default:
        throw new Error(
          `unknown Marshal type '${String.fromCharCode(t)}' (0x${t.toString(16)}) at ${this.p - 1}`,
        );
    }
  }
}

// --- writer ------------------------------------------------------------------

class Writer {
  constructor() {
    this.out = [];
    this.symbols = new Map(); // name -> index
    this.objects = new Map(); // js object -> index
  }

  byte(n) { this.out.push(n & 0xff); }

  raw(u8) { for (let i = 0; i < u8.length; i++) this.out.push(u8[i]); }

  // Mirrors Ruby's w_long (32-bit long).
  long(x) {
    if (x === 0) return this.byte(0);
    if (x > 0 && x < 123) return this.byte(x + 5);
    if (x < 0 && x > -124) return this.byte(x - 5);
    const buf = [];
    let v = x;
    let i;
    for (i = 1; i <= 4; i++) {
      buf.push(v & 0xff);
      v = Math.floor(v / 256);
      if (x < 0) v = v | 0; // keep arithmetic-shift semantics for negatives
      if (v === 0) { this.byte(i); break; }
      if (v === -1) { this.byte(-i); break; }
    }
    if (i > 4) this.byte(4);
    for (const b of buf) this.byte(b);
  }

  bytes(u8) { this.long(u8.length); this.raw(u8); }

  str(s) { this.bytes(te.encode(s)); }

  symbol(name) {
    if (this.symbols.has(name)) {
      this.byte(0x3b); // ;
      this.long(this.symbols.get(name));
      return;
    }
    this.symbols.set(name, this.symbols.size);
    this.byte(0x3a); // :
    this.str(name);
  }

  remember(v) { this.objects.set(v, this.objects.size); }

  /**
   * Write a plain JS integer that is too big for a Fixnum as a Bignum, the way
   * 32-bit Ruby would have stored it in the first place.
   *
   * Ruby registers Bignums in the object-link table, so we must burn an index
   * here too — otherwise every later link we emit would be off by one against
   * the reader's table. The key is a throwaway object so it can never match a
   * real value later.
   */
  promotedBignum(n) {
    this.objects.set({}, this.objects.size);
    const neg = n < 0;
    let m = Math.abs(n);
    const bytes = [];
    while (m > 0) { bytes.push(m % 256); m = Math.floor(m / 256); }
    if (!bytes.length) bytes.push(0);
    if (bytes.length % 2) bytes.push(0); // Bignums are counted in 16-bit words
    this.byte(0x6c); // l
    this.byte(neg ? 0x2d : 0x2b); // '-' or '+'
    this.long(bytes.length / 2);
    for (const b of bytes) this.byte(b);
  }

  ivars(list) {
    this.long(list.length);
    for (const [name, val] of list) {
      this.symbol(name);
      this.value(val);
    }
  }

  value(v) {
    if (v === null || v === undefined) return this.byte(0x30); // 0
    if (v === true) return this.byte(0x54); // T
    if (v === false) return this.byte(0x46); // F
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new Error(`non-integer number ${v}: wrap it as a Float`);
      if (v > FIXNUM_MAX || v < FIXNUM_MIN) return this.promotedBignum(v);
      this.byte(0x69); // i
      return this.long(v);
    }
    if (typeof v !== 'object' || !v.t) throw new Error(`cannot serialize ${JSON.stringify(v)}`);

    if (v.t === 'sym') return this.symbol(v.name);

    // Wrappers are transparent: they are not themselves link targets.
    if (v.t === 'extended') {
      this.byte(0x65); this.symbol(v.mod); return this.value(v.value);
    }
    if (v.t === 'uclass') {
      this.byte(0x43); this.symbol(v.cls); return this.value(v.value);
    }
    if (v.t === 'ivar') {
      this.byte(0x49); this.value(v.value); return this.ivars(v.ivars);
    }

    if (this.objects.has(v)) {
      this.byte(0x40); // @
      return this.long(this.objects.get(v));
    }

    switch (v.t) {
      case 'str': this.remember(v); this.byte(0x22); return this.bytes(v.bytes);
      case 'float': this.remember(v); this.byte(0x66); return this.bytes(v.bytes);
      case 'bignum':
        this.remember(v);
        this.byte(0x6c);
        this.byte(v.sign.charCodeAt(0));
        this.long(v.words.length / 2);
        return this.raw(v.words);
      case 'array':
        this.remember(v);
        this.byte(0x5b);
        this.long(v.items.length);
        for (const x of v.items) this.value(x);
        return;
      case 'hash':
        this.remember(v);
        this.byte(v.default === undefined ? 0x7b : 0x7d);
        this.long(v.entries.length);
        for (const [k, val] of v.entries) { this.value(k); this.value(val); }
        if (v.default !== undefined) this.value(v.default);
        return;
      case 'obj':
        this.remember(v);
        this.byte(0x6f);
        this.symbol(v.cls);
        return this.ivars(v.ivars);
      case 'userdef':
        this.remember(v);
        this.byte(0x75);
        this.symbol(v.cls);
        return this.bytes(v.bytes);
      case 'usrmarshal':
        this.remember(v);
        this.byte(0x55);
        this.symbol(v.cls);
        return this.value(v.value);
      case 'struct':
        this.remember(v);
        this.byte(0x53);
        this.symbol(v.cls);
        return this.ivars(v.ivars);
      case 'class': this.remember(v); this.byte(0x63); return this.str(v.name);
      case 'module': this.remember(v); this.byte(0x6d); return this.str(v.name);
      case 'regexp':
        this.remember(v);
        this.byte(0x2f);
        this.bytes(v.bytes);
        return this.byte(v.options);
      default:
        throw new Error(`cannot serialize tag '${v.t}'`);
    }
  }

}

// --- public API --------------------------------------------------------------

/** Read one Marshal stream starting at `pos`. Returns { value, end }. */
export function readStream(buf, pos = 0) {
  if (buf[pos] !== MAJOR || buf[pos + 1] !== MINOR) {
    throw new Error(
      `no Marshal 4.8 header at offset ${pos} ` +
      `(saw ${buf[pos]}.${buf[pos + 1]})`,
    );
  }
  const r = new Reader(buf, pos + 2);
  const value = r.value();
  return { value, end: r.p };
}

/** Read every back-to-back Marshal stream in a buffer. */
export function loadAll(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    const { value, end } = readStream(buf, p);
    out.push({ value, start: p, end });
    p = end;
  }
  return out;
}

/** Serialize one value as a complete Marshal stream. */
export function dump(value) {
  const w = new Writer();
  w.byte(MAJOR);
  w.byte(MINOR);
  w.value(value);
  return Uint8Array.from(w.out);
}

/** Serialize a list of values as back-to-back streams (the save-file layout). */
export function dumpAll(values) {
  const parts = values.map((v) => dump(v));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
