// Tolerant JSON extraction for LLM output: strips code fences and pulls the
// first balanced {...} or [...] block. Used for structured-output parsing and
// the Interviewer control token (docs/15-decisions.md D2).

export function stripFences(s: string): string {
  return s.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');
}

/** Return the first balanced JSON object/array substring, or null. */
export function firstJsonBlock(input: string): string | null {
  const s = stripFences(input);
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function extractJson(input: string): unknown {
  const block = firstJsonBlock(input);
  if (block == null) throw new Error('no JSON block found in model output');
  return JSON.parse(block);
}

/** Control-token marker the Interviewer appends; candidate text is stripped of it. */
export const CTRL_MARKER = '<<<CTRL>>>';

/** Extract the control JSON that follows the sentinel marker (D2). NFKC-folds the
 *  trailing region first so a non-English model that emits full-width JSON
 *  punctuation (｛｝："...") still parses, instead of silently defaulting the
 *  action to "advance" and breaking adaptation for CJK sessions (docs/30-i18n.md §6.6). */
export function extractControlToken(text: string): unknown | null {
  const idx = text.lastIndexOf(CTRL_MARKER);
  if (idx === -1) return null;
  const after = text.slice(idx + CTRL_MARKER.length).normalize('NFKC');
  const block = firstJsonBlock(after);
  if (block == null) return null;
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

/** Remove EVERY control marker (and the JSON block adjacent to each) so no
 *  sentinel — stray or authoritative — can ever leak into the spoken/TTS line.
 *  A marker not followed by an adjacent JSON block is still excised, so the
 *  literal `<<<CTRL>>>` never reaches the voice even on malformed model output. */
export function stripControlToken(text: string): string {
  let out = text;
  for (let idx = out.indexOf(CTRL_MARKER); idx !== -1; idx = out.indexOf(CTRL_MARKER)) {
    const after = out.slice(idx + CTRL_MARKER.length);
    // Detect the block on an NFKC-folded copy so a full-width-brace token is still
    // excised from the spoken line (never leaks to TTS). Full-width forms fold
    // 1:1 to ASCII, so indices align with the original for slicing.
    const afterN = after.normalize('NFKC');
    const block = firstJsonBlock(afterN);
    let removeLen = CTRL_MARKER.length;
    if (block != null) {
      const blockStart = afterN.indexOf(block);
      // only consume the JSON if it sits directly after the marker (whitespace only),
      // so we never swallow real spoken prose that happens to contain braces later.
      if (afterN.slice(0, blockStart).trim() === '') removeLen += blockStart + block.length;
    }
    out = out.slice(0, idx) + out.slice(idx + removeLen);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Defend against a candidate spoofing the control sentinel in their speech. */
export function sanitizeCandidateText(text: string): string {
  return text.split(CTRL_MARKER).join('').trim();
}
