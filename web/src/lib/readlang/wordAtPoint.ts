/** タップ位置の単語（英独語＋アポストロフィ等） */
const WORD_CHAR = /[\p{L}\p{M}'’\-]/u;

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document;
  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y);
  }
  const legacy = (
    doc as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint?.(x, y);
  if (!legacy) return null;
  const range = doc.createRange();
  range.setStart(legacy.offsetNode, legacy.offset);
  range.collapse(true);
  return range;
}

function expandTextNodeRangeToWord(range: Range): { text: string; rect: DOMRect } | null {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const content = node.textContent ?? "";
  if (!content) return null;

  let start = range.startOffset;
  let end = range.startOffset;
  if (start > content.length) start = content.length;
  if (end > content.length) end = content.length;

  while (start > 0 && WORD_CHAR.test(content[start - 1]!)) start -= 1;
  while (end < content.length && WORD_CHAR.test(content[end]!)) end += 1;

  const text = content.slice(start, end).replace(/^['’\-]+|['’\-]+$/g, "").trim();
  if (text.length < 1 || text.length > 80) return null;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  return { text, rect: wordRange.getBoundingClientRect() };
}

export function wordAtPoint(x: number, y: number): { text: string; rect: DOMRect; node: Node } | null {
  const at = caretRangeFromPoint(x, y);
  if (!at) return null;
  const expanded = expandTextNodeRangeToWord(at);
  if (!expanded) return null;
  return { ...expanded, node: at.startContainer };
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, a, input, textarea, select, label"));
}
