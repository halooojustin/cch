import { SelectPrompt, isCancel, getRows } from "@clack/core";
import pc from "picocolors";

export interface SelectItem {
  label: string;
  value: number;
}

export interface SelectResult {
  value: number;
  action: "select" | "delete" | "fork" | "cancel";
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
  // 需要在原始带 ANSI 的字符串上截取对应位置
  // 简单方案：用 plain 截断后返回
  return plain.slice(0, i);
}

/**
 * 计算滚动窗口（与 @clack/prompts 的 limitOptions 类似）
 */
function getWindow(cursor: number, total: number, maxItems: number): { start: number; end: number } {
  // 光标在窗口底部 3 行内时开始滚动
  const halfWin = Math.floor(maxItems / 2);
  let start = Math.max(0, cursor - halfWin);
  const end = Math.min(total, start + maxItems);
  // 修正：如果到了底部，往回调
  if (end === total) start = Math.max(0, end - maxItems);
  return { start, end };
}

/**
 * 自定义交互选择器
 * 基于 @clack/core SelectPrompt
 * 保留：vim j/k（clack 默认）、数字跳转、翻页
 * 新增：clack 风格渲染、颜色
 */
export function interactiveSelect(
  items: SelectItem[],
  opts: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey?: boolean; forkKey?: boolean } & ({ deleteKey: true } | { forkKey: true }),
): Promise<SelectResult>;
export function interactiveSelect(
  items: SelectItem[],
  opts?: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey?: false; forkKey?: false },
): Promise<number>;
export function interactiveSelect(
  items: SelectItem[],
  opts: { hint?: string; maxItems?: number; initialCursor?: number; deleteKey?: boolean; forkKey?: boolean } = {},
): Promise<number | SelectResult> {
  const useDelete = opts.deleteKey ?? false;
  const useFork = opts.forkKey ?? false;
  if (!process.stdin.isTTY) return Promise.resolve(useDelete ? { value: -1, action: "cancel" as const } : -1);
  if (!items.length) return Promise.resolve(useDelete ? { value: -1, action: "cancel" as const } : -1);

  const maxItems = opts.maxItems ?? Math.max(Math.min(items.length, getRows(process.stdout) - 6), 5);
  const hint = opts.hint ?? "↑↓/jk 导航 · 数字跳转 · Enter 确认 · Esc 取消";
  let inputBuf = "";
  let lastDKey = 0; // dd 双击检测时间戳
  let deleteTriggered = false;
  let forkTriggered = false;

  const options = items.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  const prompt = new SelectPrompt({
    options,
    initialValue: items[opts.initialCursor ?? 0]?.value,
    render() {
      const cols = process.stdout.columns || 80;
      const title = `${pc.gray(S_BAR)}  ${pc.dim(hint)}${inputBuf ? pc.cyan(` > ${inputBuf}_`) : ""}`;

      const { start, end } = getWindow(this.cursor, items.length, maxItems);
      const lines: string[] = [title];

      // 顶部省略提示
      if (start > 0) {
        lines.push(`${pc.gray(S_BAR)}  ${pc.dim(`... ${start} more above`)}`);
      }

      for (let i = start; i < end; i++) {
        const isActive = i === this.cursor;
        const label = truncate(items[i].label, cols - 6);
        if (isActive) {
          lines.push(`${pc.gray(S_BAR)}  ${pc.cyan(S_RADIO_ACTIVE)} ${pc.cyan(label)}`);
        } else {
          lines.push(`${pc.gray(S_BAR)}  ${pc.dim(S_RADIO_INACTIVE)} ${label}`);
        }
      }

      // 底部省略提示
      if (end < items.length) {
        lines.push(`${pc.gray(S_BAR)}  ${pc.dim(`... ${items.length - end} more below`)}`);
      }

      // 底部边框
      if (this.state === "submit") {
        if (deleteTriggered) {
          const selected = items[this.cursor];
          const name = selected ? truncate(selected.label.trim(), cols - 10) : "";
          return `${pc.gray(S_BAR_END)}  ${pc.red("✕")} ${pc.strikethrough(pc.dim(name))}`;
        }
        if (forkTriggered) {
          const selected = items[this.cursor];
          const name = selected ? truncate(selected.label.trim(), cols - 10) : "";
          return `${pc.gray(S_BAR_END)}  ${pc.cyan("⑂")} ${pc.cyan(name)}`;
        }
        const selected = items[this.cursor];
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

  // 监听按键事件处理数字跳转和退出
  prompt.on("key", (char) => {
    if (char === undefined) return;

    if (/^[0-9]$/.test(char)) {
      inputBuf += char;
      // 自动跳转到对应项（如果数字有效）
      const num = parseInt(inputBuf, 10);
      if (num >= 1 && num <= items.length) {
        (prompt as any).cursor = num - 1;
        (prompt as any)._setValue(items[num - 1].value);
      }
      (prompt as any).render();
    } else if (char === "\x7F" || char === "\b") {
      // Backspace
      if (inputBuf.length > 0) {
        inputBuf = inputBuf.slice(0, -1);
        (prompt as any).render();
      }
    } else if (char === "f" && useFork && !inputBuf) {
      forkTriggered = true;
      (prompt as any).state = "submit";
      (prompt as any).value = items[(prompt as any).cursor]?.value;
      (prompt as any).emit("finalize");
      (prompt as any).render();
      (prompt as any).close();
      return;
    } else if (char === "d" && useDelete && !inputBuf) {
      // dd 双击删除
      const now = Date.now();
      if (now - lastDKey < 500) {
        deleteTriggered = true;
        // Trigger submit so the promise resolves normally
        (prompt as any).state = "submit";
        (prompt as any).value = items[(prompt as any).cursor]?.value;
        (prompt as any).emit("finalize");
        (prompt as any).render();
        (prompt as any).close();
        return;
      }
      lastDKey = now;
    } else if (char === "q") {
      // q 取消（除了正在输入数字时）
      if (!inputBuf) {
        (prompt as any).close();
      }
    } else {
      // 非数字输入时清空 buffer
      if (!/^[jk]$/.test(char)) {
        inputBuf = "";
      }
    }
  });

  // 监听方向键时清空数字 buffer
  prompt.on("cursor", () => {
    inputBuf = "";
  });

  return prompt.prompt().then((result) => {
    if (useDelete || useFork) {
      if (deleteTriggered) {
        return { value: (prompt as any).cursor, action: "delete" as const };
      }
      if (forkTriggered) {
        return { value: (prompt as any).cursor, action: "fork" as const };
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
