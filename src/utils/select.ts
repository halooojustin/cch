/**
 * Interactive arrow-key selector for terminal.
 * Zero dependencies — uses raw stdin mode.
 */

const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K\r`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const CYAN_BG = `${ESC}[46m${ESC}[30m`;

export interface SelectItem {
  label: string;
  value: number;
}

/** Get display width of string, accounting for wide (CJK) chars */
export function stringWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)!;
    width += isWide(code) ? 2 : 1;
    if (code > 0xffff) i++;
  }
  return width;
}

function isWide(code: number): boolean {
  return code >= 0x1100 && (
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
}

/** Pad string to target display width with spaces */
export function padEndWidth(str: string, targetWidth: number): string {
  const w = stringWidth(str);
  return w >= targetWidth ? str : str + " ".repeat(targetWidth - w);
}

/** Truncate string to fit terminal width, accounting for wide (CJK) chars */
/** Truncate string to fit maxWidth display columns */
function truncate(str: string, maxWidth: number): string {
  let width = 0;
  let i = 0;
  for (; i < str.length; i++) {
    const code = str.codePointAt(i)!;
    const charWidth = isWide(code) ? 2 : 1;
    if (width + charWidth > maxWidth) break;
    width += charWidth;
    if (code > 0xffff) i++;
  }
  return str.slice(0, i);
}

/** Strip ANSI escape codes for width calculation */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function interactiveSelect(items: SelectItem[], hint = "Up/Down to navigate, Enter to select, Esc to cancel"): Promise<number> {
  if (!process.stdin.isTTY) return Promise.resolve(-1);

  return new Promise((resolve) => {
    let cursor = 0;
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    const pageSize = Math.min(items.length, rows - 4);

    function getWindow(): { start: number; end: number } {
      let start = 0;
      if (cursor >= pageSize) {
        start = cursor - pageSize + 1;
      }
      return { start, end: Math.min(start + pageSize, items.length) };
    }

    function renderLines(): string[] {
      const { start, end } = getWindow();
      const lines: string[] = [];
      const inputDisplay = inputBuf ? ` > ${inputBuf}_` : "";
      lines.push(truncate(`${DIM}${hint}${RESET}${inputDisplay}`, cols));

      for (let i = start; i < end; i++) {
        const raw = items[i].label;
        if (i === cursor) {
          const label = truncate(raw, cols - 4);
          lines.push(`${CYAN_BG} > ${label} ${RESET}`);
        } else {
          const label = truncate(raw, cols - 3);
          lines.push(`   ${label}`);
        }
      }

      if (end < items.length) {
        lines.push(`${DIM}  ... ${items.length - end} more below${RESET}`);
      }
      return lines;
    }

    let drawnLines = 0;

    function draw() {
      // Move to top of previously drawn area and clear
      for (let i = 0; i < drawnLines; i++) {
        process.stdout.write(`${ESC}[A`); // up one line
      }

      const lines = renderLines();
      for (let i = 0; i < lines.length; i++) {
        process.stdout.write(`${CLEAR_LINE}${lines[i]}\n`);
      }
      // Clear any leftover lines from previous render
      for (let i = lines.length; i < drawnLines; i++) {
        process.stdout.write(`${CLEAR_LINE}\n`);
      }
      // Move back up for leftover cleared lines
      const extra = Math.max(0, drawnLines - lines.length);
      for (let i = 0; i < extra; i++) {
        process.stdout.write(`${ESC}[A`);
      }

      drawnLines = lines.length;
    }

    let inputBuf = "";

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      process.stdout.write(CURSOR_SHOW);
    }

    function onData(buf: Buffer) {
      const key = buf.toString();

      if (key === `${ESC}[A` || key === "k") {
        inputBuf = "";
        if (cursor > 0) cursor--;
        draw();
      } else if (key === `${ESC}[B` || key === "j") {
        inputBuf = "";
        if (cursor < items.length - 1) cursor++;
        draw();
      } else if (key === "\r" || key === "\n") {
        // If there's a number in the input buffer, use that
        if (inputBuf) {
          const num = parseInt(inputBuf, 10);
          if (num >= 1 && num <= items.length) {
            cleanup();
            resolve(items[num - 1].value);
            return;
          }
        }
        // Otherwise use arrow-selected item
        cleanup();
        resolve(items[cursor].value);
      } else if (key === ESC || key === "q" || key === "\x03") {
        cleanup();
        resolve(-1);
      } else if (key === "\x7f" || key === "\b") {
        // Backspace
        if (inputBuf.length > 0) {
          inputBuf = inputBuf.slice(0, -1);
          draw();
        }
      } else if (/^[0-9]$/.test(key)) {
        inputBuf += key;
        draw();
      }
    }

    process.stdout.write(CURSOR_HIDE);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    draw();
  });
}
