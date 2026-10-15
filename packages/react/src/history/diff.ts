import type { FolioDocument } from "@futelab/folio-core/browser";
export interface FolioRevisionDiff {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** Large comparisons use bounded alignment rather than claiming exact counts. */
  approximate?: boolean;
}
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
/** Counts top-level block edit hunks, not word or nested table-cell changes. */
export function compareFolioRevisions(
  before: FolioDocument,
  after: FolioDocument,
): FolioRevisionDiff {
  const left = (before.content ?? []).map(canonical),
    right = (after.content ?? []).map(canonical);
  let start = 0,
    end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  while (
    end < left.length - start &&
    end < right.length - start &&
    left[left.length - 1 - end] === right[right.length - 1 - end]
  )
    end += 1;
  const a = left.slice(start, left.length - end),
    b = right.slice(start, right.length - end);
  const anchors: Array<[number, number]> = [];
  const approximate = a.length * b.length > 1_000_000;
  if (!approximate) {
    const width = b.length + 1,
      table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i -= 1)
      for (let j = b.length - 1; j >= 0; j -= 1)
        table[i * width + j] =
          a[i] === b[j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0,
      j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) anchors.push([i++, j++]);
      else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i += 1;
      else j += 1;
    }
  } else {
    // A monotone alignment cannot invent unchanged blocks. Repeated middle
    // blocks remain matchable instead of being discarded by unique-only matching.
    const positions = new Map<string, number[]>();
    b.forEach((value, index) => {
      const values = positions.get(value) ?? [];
      values.push(index);
      positions.set(value, values);
    });
    let minimum = 0;
    a.forEach((value, index) => {
      const candidates = positions.get(value);
      if (!candidates) return;
      let low = 0,
        high = candidates.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (candidates[mid]! < minimum) low = mid + 1;
        else high = mid;
      }
      const position = candidates[low];
      if (position !== undefined) {
        anchors.push([index, position]);
        minimum = position + 1;
      }
    });
  }
  let added = 0,
    removed = 0,
    changed = 0,
    previousA = 0,
    previousB = 0;
  for (const [indexA, indexB] of [...anchors, [a.length, b.length] as [number, number]]) {
    const countA = indexA - previousA,
      countB = indexB - previousB,
      paired = Math.min(countA, countB);
    changed += paired;
    removed += countA - paired;
    added += countB - paired;
    previousA = indexA + 1;
    previousB = indexB + 1;
  }
  return {
    added,
    removed,
    changed,
    unchanged: start + end + anchors.length,
    ...(approximate ? { approximate: true } : {}),
  };
}
