# cch — Claude / Codex 对话历史管理

为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 和 Codex 打造的 AI 对话历史管理工具。

用自然语言找到过去的对话，跨项目浏览历史，并在 Zellij 或 tmux 里恢复它。

## 痛点

Claude Code 的对话历史存在 `~/.claude/projects/` 下，按项目目录隔离。当你同时在多个 repo 工作时：

- `claude --resume` 只能看到**当前目录**的历史
- 无法跨项目搜索某个对话
- 关掉终端就丢失活跃会话
- 没有全局视图查看正在运行的 Claude 会话

## 安装

```bash
npm install -g @halooojustin/cch
ch setup          # 自动添加 shell 别名 (cn, cnf, cls, cps, chs)
source ~/.zshrc   # 或新开终端
```

### Claude Code Skill（可选）

安装 skill 后，Claude Code 就能自动帮你用 `ch` 命令：

```bash
cp -r $(npm root -g)/cch/skill ~/.claude/skills/cch
```

安装后直接对 Claude Code 说"帮我找之前调试 iOS 的对话"，它会自动调用 `ch` 搜索。

**前置条件：**
- Node.js >= 18
- 已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- 已安装 [Zellij](https://zellij.dev/)（推荐）或 [tmux](https://github.com/tmux/tmux) — 安装：`brew install zellij`

## 使用方法

### 自然语言搜索

随便描述你记得的内容，AI 帮你找到对应的对话。

```bash
ch 上次帮我调试 iOS 的那个对话
ch 帮我部署虾的那几个
ch demo 钱包重构的那个
ch --provider codex 那个讨论 cmux resume 的对话
ch --provider all 讨论认证跳转的那个会话
```

Claude 作用域下，`ch` 会优先使用 `claude-mem` 做语义搜索；找不到时再回退到 Claude CLI 排序。Codex 和 `all` 模式则走 provider-aware 的候选会话表。

### 命令一览

```bash
ch <描述>                                自然语言搜索（默认搜 Claude）
ch --provider codex <描述>               只搜 Codex 历史
ch --provider all <描述>                 跨 Claude + Codex 搜索
ch ls [-n 20] [--provider <p>]           浏览历史并恢复
ch search <关键词> [--provider <p>]      精确关键词搜索
ch new [描述] [--provider <p>]           新建 Claude 或 Codex 会话
ch new -f [描述] [--provider <p>]        强制新建（先杀旧会话）
ch ps                                    查看活跃的终端复用器会话
ch attach <会话名>                       连接到活跃会话
ch kill <会话名>                         关闭会话
ch resume <session-id> [--provider <p>]  通过 session ID 恢复
ch config                                查看配置
ch setup                                 安装 shell 别名
```

`--provider` 可取：

- `claude`
- `codex`
- `all`

### 交互式选择器

`ch ls`、`ch search` 和自然语言搜索结果都支持交互式选择：

- **上下箭头** 或 **j/k** — 导航选择
- **数字键** — 输入数字（如 `12`）然后 **Enter** 直接跳转
- **Enter** — 确认选择（恢复历史会话或连接活跃会话）
- **Esc** 或 **q** — 取消退出

中文文本使用显示宽度感知的列对齐，不会错位。

### 两级恢复

**第一级 — 活跃会话：** 会话还在终端复用器里运行？

```bash
ch ps                    # 交互式列表 — 选一个直接连接
```

**第二级 — 历史恢复：** 会话已结束，想重新捡起来？

```bash
ch 那个讨论登录bug的对话     # AI 帮你找
# 或者
ch ls                       # 交互式列表 — 选一个恢复
ch ls --provider codex      # 只看 Codex 历史
ch ls --provider all        # 看合并后的历史
```

两种方式都会在 Zellij/tmux 会话里打开，通过登录 shell（`zsh -lc`）启动以继承完整环境和认证信息。随时可以断开和重连。

### 会话管理

```bash
# 在当前项目启动新的 Claude 会话
ch new

# 启动新的 Codex 会话
ch new --provider codex

# 带描述（会显示在 ch ls 和 Zellij tab 名中）
ch new "fix authentication bug"
ch new 修复登录bug              # 支持中文描述

# 强制重启（先关闭旧会话）
ch new -f "重新开始搞认证"

# 查看当前活跃的复用器会话
ch ps

# 清理
ch kill ch-myproject-fix-auth
```

### 会话描述

传给 `ch new` 的描述会用在多个地方：

- **Zellij tab 名** — 进入会话后在 tab 栏可见（支持中文）
- **`ch ls` 输出** — 显示在会话名旁边
- **会话名** — 英文描述直接拼入会话名（如 `ch-myproject-fix-login-bug`），中文描述使用哈希缩写（如 `ch-myproject-a1b2c3`），因为 Zellij 会话名不支持 CJK 字符

## 配置

配置文件位于 `~/.config/cch/config.json`：

```json
{
  "backend": "auto",
  "claudeCommand": "claude",
  "claudeArgs": ["--dangerously-skip-permissions"],
  "codexCommand": "codex",
  "codexArgs": ["--no-alt-screen"],
  "defaultProvider": "claude",
  "historyLimit": 100,
  "excludeDirs": ["claude-mem"]
}
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `backend` | `"auto"` | `"auto"`、`"zellij"` 或 `"tmux"` |
| `claudeCommand` | `"claude"` | Claude CLI 路径 |
| `claudeArgs` | `["--dangerously-skip-permissions"]` | 新建会话和恢复会话时的默认参数 |
| `codexCommand` | `"codex"` | Codex CLI 路径 |
| `codexArgs` | `["--no-alt-screen"]` | Codex 新建/恢复会话时的默认参数 |
| `defaultProvider` | `"claude"` | 持久化的默认 provider 值 |
| `historyLimit` | `100` | AI 搜索时加载的最大会话数 |
| `excludeDirs` | `["claude-mem"]` | Claude JSONL 扫描时跳过的目录 |

```bash
ch config set backend tmux
ch config set historyLimit 200
ch config set codexArgs --no-alt-screen,--model,o3
```

## 推荐别名

加到你的 `.zshrc` 或 `.bashrc`：

```bash
alias cn="ch new"
alias cnf="ch new -f"
alias cls="ch ls"
alias cps="ch ps"
alias chs="ch search"
```

然后使用：

```bash
cn fix login bug        # 带描述新建会话
cn 修复登录bug           # 支持中文描述
cnf                     # 强制重启当前项目会话
cls                     # 交互式浏览历史
cps                     # 交互式查看活跃会话
chs 龙虾                # 关键词搜索
```

## 工作原理

1. **Provider-aware 历史层** — Claude 历史来自 `~/.claude/projects/**/*.jsonl`；Codex 历史来自 `~/.codex/state_5.sqlite`，不可用时回退到 `session_index.jsonl`。两者都会归一化成统一的 `HistorySession`。

2. **Claude 快速路径** — 在 Claude 作用域下，`cch` 会优先用 `claude-mem` 做语义搜索，找不到再回退到 Claude CLI 排序。

3. **混合作用域搜索** — 在 Codex 和 `all` 模式下，`cch` 会构建 provider-aware 会话表，再交给 Claude CLI 排序。

4. **终端复用器集成** — 新建和恢复都会进 Zellij/tmux。Claude 恢复使用 `--resume <id>`；Codex 恢复使用 `resume <id>`。

5. **元数据和缓存** — 会话描述保存在 `~/.config/cch/sessions.json`，历史缓存保存在 `~/.config/cch/cache.json`。

## 本地验证

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js --help
```

如果机器上同时有 Claude / Codex 和本地历史，可再手动 smoke-check：

```bash
node dist/cli.js ls --provider claude
node dist/cli.js ls --provider codex
node dist/cli.js ls --provider all
```

## 许可证

MIT
