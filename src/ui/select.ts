import { SelectPrompt, isCancel, getRows } from "@clack/core";
import pc from "picocolors";

export interface SelectItem {
  label: string;
  value: number;
}

export interface SelectResult {
  value: number;
  action: "select" | "delete" | "cancel";
}

const S_BAR = "│";
const S_BAR_END = "└";
const S_RADIO_ACTIVE = "●";
const S_RADIO_INACTIVE = "○";

/** 按显示宽度截断（考虑 CJK + ANSI） */
function truncate(str: string, maxWidth: number): string {
  const plain = str.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  let i = 0;
  for (; i < plain.length; i++) {
    const code = plain.codePointAt(i)!;
    const isWide = code >= 0x1100 && (
      (code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    );
    const charWidth = isWide ? 2 : 1;
    if (width + charWidth > maxWidth) break;
    width += charWidth;
    if (code > 0xffff) i++;
  }
  return plain.slice(0, i);
}

function getWindow(cursor: number, total: number, maxItems: number): { start: number; end: number } {
  const halfWin = Math.floor(maxItems / 2);
  let start = Math.max(0, cursor - halfWin);
  const end = Math.min(total, start + maxItems);
  if (end === total) start = Math.max(0, end - maxItems);
  return { start, end };
}

/** Strip ANSI for search matching */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function interactiveSelect(
  items: SelectItem[],
  opts: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey: true },
): Promise<SelectResult>;
export function interactiveSelect(
  items: SelectItem[],
  opts?: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey?: false },
): Promise<number>;
export function interactiveSelect(
  items: SelectItem[],
  opts: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey?: boolean } = {},
): Promise<number | SelectResult> {
  const useDelete = opts.deleteKey ?? false;
  if (!process.stdin.isTTY) return Promise.resolve(useDelete ? { value: -1, action: "cancel" as const } : -1);
  if (!items.length) return Promise.resolve(useDelete ? { value: -1, action: "cancel" as const } : -1);

  const maxItems = opts.maxItems ?? Math.max(Math.min(items.length, getRows(process.stdout) - 6), 5);
  const defaultHint = "↑↓/jk 导航 · 数字跳转 · / 搜索 · Enter 确认 · Esc 取消";
  const hint = opts.hint ?? defaultHint;
  let inputBuf = "";
  let searchMode = false;
  let searchQuery = "";
  let filteredItems = items;
  let filteredCursor = 0;
  let lastDKey = 0;
  let deleteTriggered = false;

  function applyFilter() {
    if (!searchQuery) {
      filteredItems = items;
    } else {
      const q = searchQuery.toLowerCase();
      filteredItems = items.filter((item) => stripAnsi(item.label).toLowerCase().includes(q));
    }
    filteredCursor = Math.min(filteredCursor, Math.max(0, filteredItems.length - 1));
  }

  const options = items.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  const prompt = new SelectPrompt({
    options,
    initialValue: items[opts.initialCursor ?? 0]?.value,
    render() {
      const cols = process.stdout.columns || 80;

      // Status line
      let statusText: string;
      if (searchMode) {
        statusText = `${pc.cyan("/")}${pc.cyan(searchQuery)}${pc.dim("_")} ${pc.dim(`(${filteredItems.length}/${items.length})`)}`;
      } else if (inputBuf) {
        statusText = pc.cyan(` > ${inputBuf}_`);
      } else {
        statusText = "";
      }
      const title = `${pc.gray(S_BAR)}  ${pc.dim(hint)}${statusText ? " " + statusText : ""}`;

      const displayItems = filteredItems;
      const cursor = searchMode ? filteredCursor : this.cursor;
      const { start, end } = getWindow(cursor, displayItems.length, maxItems);
      const lines: string[] = [title];

      if (displayItems.length === 0) {
        lines.push(`${pc.gray(S_BAR)}  ${pc.dim("No matches")}`);
      } else {
        if (start > 0) {
          lines.push(`${pc.gray(S_BAR)}  ${pc.dim(`... ${start} more above`)}`);
        }

        for (let i = start; i < end; i++) {
          const isActive = i === cursor;
          const label = truncate(displayItems[i].label, cols - 6);
          if (isActive) {
            lines.push(`${pc.gray(S_BAR)}  ${pc.cyan(S_RADIO_ACTIVE)} ${pc.cyan(label)}`);
          } else {
            lines.push(`${pc.gray(S_BAR)}  ${pc.dim(S_RADIO_INACTIVE)} ${label}`);
          }
        }

        if (end < displayItems.length) {
          lines.push(`${pc.gray(S_BAR)}  ${pc.dim(`... ${displayItems.length - end} more below`)}`);
        }
      }

      if (this.state === "submit") {
        if (deleteTriggered) {
          const selected = displayItems[cursor];
          const name = selected ? truncate(selected.label.trim(), cols - 10) : "";
          return `${pc.gray(S_BAR_END)}  ${pc.red("✕")} ${pc.strikethrough(pc.dim(name))}`;
        }
        const selected = displayItems[cursor];
        const msg = selected ? truncate(selected.label.trim(), cols - 6) : "";
        return `${pc.gray(S_BAR_END)}  ${pc.dim(msg)}`;
      }
      if (this.state === "cancel") {
        return `${pc.gray(S_BAR_END)}  ${pc.strikethrough(pc.dim("已取消"))}`;
      }

      lines.push(`${pc.gray(S_BAR)}`);
      return lines.join("\n");
    },
  });

  prompt.on("key", (char) => {
    if (char === undefined) return;

    // Search mode handling
    if (searchMode) {
      if (char === "\x1b" || char === "\r" || char === "\n") {
        // Esc or Enter exits search mode
        searchMode = false;
        if (char === "\r" || char === "\n") {
          // Enter: select the current filtered item
          if (filteredItems.length > 0) {
            const selected = filteredItems[filteredCursor];
            // Find the index in the original items
            const origIdx = items.indexOf(selected);
            if (origIdx >= 0) {
              (prompt as any).cursor = origIdx;
              (prompt as any)._setValue(selected.value);
              (prompt as any).state = "submit";
              (prompt as any).emit("finalize");
              (prompt as any).render();
              (prompt as any).close();
            }
          }
          return;
        }
        // Esc: clear search, back to full list
        searchQuery = "";
        applyFilter();
        (prompt as any).render();
        return;
      }
      if (char === "\x7F" || char === "\b") {
        searchQuery = searchQuery.slice(0, -1);
        applyFilter();
        (prompt as any).render();
        return;
      }
      // Arrow keys in search mode
      if (char === "\x1b[A" || char === "k") {
        if (filteredCursor > 0) filteredCursor--;
        (prompt as any).render();
        return;
      }
      if (char === "\x1b[B" || char === "j") {
        if (filteredCursor < filteredItems.length - 1) filteredCursor++;
        (prompt as any).render();
        return;
      }
      // Any printable char → add to search
      if (char.length === 1 && char >= " ") {
        searchQuery += char;
        applyFilter();
        (prompt as any).render();
      }
      return;
    }

    // Normal mode
    if (char === "/") {
      searchMode = true;
      searchQuery = "";
      inputBuf = "";
      applyFilter();
      (prompt as any).render();
    } else if (/^[0-9]$/.test(char)) {
      inputBuf += char;
      const num = parseInt(inputBuf, 10);
      if (num >= 1 && num <= items.length) {
        (prompt as any).cursor = num - 1;
        (prompt as any)._setValue(items[num - 1].value);
      }
      (prompt as any).render();
    } else if (char === "\x7F" || char === "\b") {
      if (inputBuf.length > 0) {
        inputBuf = inputBuf.slice(0, -1);
        (prompt as any).render();
      }
    } else if (char === "d" && useDelete && !inputBuf) {
      const now = Date.now();
      if (now - lastDKey < 500) {
        deleteTriggered = true;
        (prompt as any).state = "submit";
        (prompt as any).value = items[(prompt as any).cursor]?.value;
        (prompt as any).emit("finalize");
        (prompt as any).render();
        (prompt as any).close();
        return;
      }
      lastDKey = now;
    } else if (char === "q") {
      if (!inputBuf) {
        (prompt as any).close();
      }
    } else {
      if (!/^[jk]$/.test(char)) {
        inputBuf = "";
      }
    }
  });

  prompt.on("cursor", () => {
    if (!searchMode) inputBuf = "";
  });

  return prompt.prompt().then((result) => {
    if (useDelete) {
      if (deleteTriggered) {
        return { value: (prompt as any).cursor, action: "delete" as const };
      }
      if (isCancel(result) || result === undefined) {
        return { value: -1, action: "cancel" as const };
      }
      let value = result as number;
      if (inputBuf) {
        const num = parseInt(inputBuf, 10);
        if (num >= 1 && num <= items.length) value = items[num - 1].value;
      }
      return { value, action: "select" as const };
    }

    if (isCancel(result) || result === undefined) return -1;
    if (inputBuf) {
      const num = parseInt(inputBuf, 10);
      if (num >= 1 && num <= items.length) return items[num - 1].value;
    }
    return result as number;
  });
}
