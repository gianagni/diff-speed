// Faster Myers line diff: run(input) returns make.fun's own patch of { old, new }.
// Own implementation, written from the competition's rules and the reference
// program's header. Lines are hashed to small integers once, the greedy Myers
// search runs on a typed array, and the patch is formatted exactly as the
// reference formats it. No dependency, no network, no clock, no randomness.

const KEEP = '=';
const DELETE = '-';
const INSERT = '+';
const CONTEXT = 3;
const FORMAT = 'makefun-diff/1';

/** A text's lines, each with its "\n" (the last one without, when the text does not end in one). */
function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(parts[i] + '\n');
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

/** The runs of the edit script of the trimmed middle, [{ kind, count }], in order. */
function myersRuns(a, b, n, m) {
  if (n === 0 && m === 0) return [];
  // The trace: one Int32Array per d, row d holding diagonal k at slot k+d, the
  // old lines consumed after d edits and its snake, plus one (0 means the
  // diagonal was never reached, so a fresh row needs no fill). Row d's entries
  // are only ever read at d-1, so rows are freed as the search moves on, apart
  // from the ones the walk back needs.
  const rows = [];
  // d = 0: the snake from the start of both texts.
  let x = 0;
  let y = 0;
  while (x < n && y < m && a[x] === b[y]) {
    x++;
    y++;
  }
  const row0 = new Int32Array(1);
  row0[0] = x + 1;
  rows.push(row0);
  if (x >= n && y >= m) return [{ kind: KEEP, count: x }];
  let D = -1;
  for (let d = 1; d <= n + m; d++) {
    const prev = rows[d - 1];
    const cur = new Int32Array(2 * d + 1);
    rows.push(cur);
    // Diagonal -d has only the insertion's candidate, diagonal d only the
    // deletion's; the diagonals between them have both.
    let s = prev[0];
    if (s !== 0 && s - 1 + d <= m) {
      x = s - 1;
      y = x + d;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[0] = x + 1;
      if (x >= n && y >= m) {
        D = d;
        break;
      }
    }
    for (let k = -d + 2; k <= d - 2; k += 2) {
      // The deletion's candidate: one old line past diagonal k-1's point, valid
      // while it stays inside the old text. The insertion's candidate: diagonal
      // k+1's point unchanged, valid while its new line stays inside the new text.
      const sDown = prev[k - 1 + (d - 1)];
      const sRight = prev[k + 1 + (d - 1)];
      let xDown = -1;
      let xRight = -1;
      if (sDown !== 0 && sDown <= n) xDown = sDown;
      if (sRight !== 0 && sRight - 1 - k <= m) xRight = sRight - 1;
      if (xDown < 0 && xRight < 0) continue;
      // The candidate further into the old text wins, the deletion when both
      // reach the same point.
      x = xDown >= 0 && (xRight < 0 || xDown >= xRight) ? xDown : xRight;
      y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[k + d] = x + 1;
      if (x >= n && y >= m) {
        D = d;
        break;
      }
    }
    if (D >= 0) break;
    s = prev[2 * d - 2];
    if (s !== 0 && s <= n) {
      x = s;
      y = x - d;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[2 * d] = x + 1;
      if (x >= n && y >= m) D = d;
    }
    if (D >= 0) break;
  }
  if (D < 0) throw new Error('diff: the search ended without reaching both ends');
  // Walk the search back from the end, rebuilding the op sequence in reverse.
  // The choice at each step repeats the forward pass's rule exactly, so the
  // path walked back is the path the search took forward.
  const ops = new Uint8Array(n + m); // 0 keep, 1 delete, 2 insert
  let w = n + m;
  x = n;
  y = m;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const prev = rows[d - 1];
    let xDown = -1;
    let xRight = -1;
    if (k > -d) {
      const s = prev[k - 1 + (d - 1)];
      if (s !== 0 && s <= n) xDown = s;
    }
    if (k < d) {
      const s = prev[k + 1 + (d - 1)];
      if (s !== 0 && s - 1 - k <= m) xRight = s - 1;
    }
    let xe;
    let move;
    if (xDown >= 0 && (xRight < 0 || xDown >= xRight)) {
      xe = xDown;
      move = 1;
    } else if (xRight >= 0) {
      xe = xRight;
      move = 2;
    } else {
      throw new Error('diff: the walk back found no move to retrace');
    }
    const ye = xe - k;
    for (let i = x - xe; i > 0; i--) ops[--w] = 0;
    ops[--w] = move;
    if (move === 1) {
      x = xe - 1;
      y = ye;
    } else {
      x = xe;
      y = ye - 1;
    }
  }
  for (let i = x; i > 0; i--) ops[--w] = 0;
  // Merge the op sequence into runs, in order.
  const runs = [];
  let i = w;
  const end = n + m;
  while (i < end) {
    const kind = ops[i] === 0 ? KEEP : ops[i] === 1 ? DELETE : INSERT;
    let count = 0;
    const code = ops[i];
    while (i < end && ops[i] === code) {
      i++;
      count++;
    }
    runs.push({ kind, count });
  }
  return runs;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/** make.fun's own patch of input.old into input.new, as one string. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('diff: the input is { old, new }, two strings');
  }
  const aLines = tokenize(input.old);
  const bLines = tokenize(input.new);
  // Hash every line to a small integer once, so the search compares ints.
  const ids = new Map();
  const a = new Int32Array(aLines.length);
  const b = new Int32Array(bLines.length);
  let next = 0;
  for (let i = 0; i < aLines.length; i++) {
    const s = aLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = next++;
      ids.set(s, id);
    }
    a[i] = id;
  }
  for (let i = 0; i < bLines.length; i++) {
    const s = bLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = next++;
      ids.set(s, id);
    }
    b[i] = id;
  }
  const n = a.length;
  const m = b.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...myersRuns(a.subarray(prefix, n - suffix), b.subarray(prefix, m - suffix), n - prefix - suffix, m - prefix - suffix));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes.length ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length ? hunks[hunks.length - 1] : undefined;
    const prev = h ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written(KEEP, aLines[at]));
      for (let i = 0; i < c.dels; i++) out.push(written(DELETE, aLines[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written(INSERT, bLines[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written(KEEP, aLines[at]));
  }
  return out.join('');
}
