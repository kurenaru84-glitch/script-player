const MIN_CHARS = 1;
const MAX_CHARS = 120;

export function normalizeSelectedText(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < MIN_CHARS || t.length > MAX_CHARS) return null;
  return t;
}

export function findCueIndexFromNode(node: Node | null, root: HTMLElement): number | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && el !== root) {
    const idx = el.dataset.cueIndex;
    if (idx != null && el.classList.contains("readlang-selectable")) {
      const n = Number.parseInt(idx, 10);
      return Number.isFinite(n) ? n : null;
    }
    el = el.parentElement;
  }
  return null;
}

export function selectionInsideRoot(sel: Selection, root: HTMLElement): boolean {
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!anchor || !focus) return false;
  return root.contains(anchor) && root.contains(focus);
}
