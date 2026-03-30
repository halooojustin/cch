---
name: cch
description: 安装和配置 CCH (Claude Code History) — 跨项目对话历史管理 CLI 工具。当用户说"安装 cch"、"install cch"、"配置 cch"、"setup cch"、"/cch" 时使用。
allowed-tools: Bash, Read, AskUserQuestion
---

# CCH — Claude Code History 安装配置

帮助用户一键安装 CCH 及其所有前置依赖。

CCH 是一个**终端命令行工具**，安装完成后在 Claude Code 外面使用。

## 触发词

- "安装 cch"、"install cch"
- "配置 cch"、"setup cch"
- "/cch"

## 执行步骤

### 1. 检测操作系统和包管理器

```bash
uname -s
which brew || which apt-get || which yum
```

- macOS：使用 Homebrew（如果没装 Homebrew，先装它）
- Linux (Debian/Ubuntu)：使用 apt-get
- Linux (RHEL/CentOS)：使用 yum

如果是 macOS 且没有 Homebrew：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. 安装 Node.js（如果需要）

```bash
node --version 2>/dev/null || echo "NOT_INSTALLED"
```

如果没安装或版本 < 18：

**macOS:**
```bash
brew install node
```

**Linux (Debian/Ubuntu):**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

验证：
```bash
node --version   # 应该 >= 18
npm --version
```

### 3. 安装终端复用器（Zellij 或 tmux）

```bash
which zellij 2>/dev/null || which tmux 2>/dev/null || echo "NONE_INSTALLED"
```

如果都没装，推荐 Zellij（更现代、无需额外配置）：

**macOS:**
```bash
brew install zellij
```

**Linux:**
```bash
bash <(curl -L zellij.dev/launch)
```

如果用户偏好 tmux：

**macOS:**
```bash
brew install tmux
```

**Linux:**
```bash
sudo apt-get install -y tmux
```

### 4. 安装 Claude Code CLI（如果需要）

```bash
which claude 2>/dev/null || echo "NOT_INSTALLED"
```

如果没装：

```bash
npm install -g @anthropic-ai/claude-code
```

安装后需要用户登录一次：

```bash
claude
```

提示用户按照终端里的指引完成认证。

### 5. 安装 CCH

```bash
npm install -g cch
```

### 6. 设置 shell 别名

```bash
ch setup
```

会自动检测 zsh/bash，向对应的 rc 文件追加别名：

| 别名 | 等价于 | 说明 |
|------|--------|------|
| `cn` | `ch new` | 新建 Claude 会话 |
| `cnf` | `ch new -f` | 强制新建（先关旧的） |
| `cls` | `ch ls` | 浏览历史对话 |
| `cps` | `ch ps` | 查看活跃会话 |
| `chs` | `ch search` | 关键词搜索 |

### 7. 生效配置

```bash
source ~/.zshrc    # 或 source ~/.bashrc
```

### 8. 验证安装

逐项验证：

```bash
ch --version       # 应该输出版本号
ch ls              # 应该显示历史对话列表（如果之前用过 Claude Code）
ch config          # 应该显示配置信息
```

## 安装完成后

告诉用户以下信息：

> CCH 安装完成！这是一个**终端命令行工具**，退出 Claude Code 后在终端里使用。
>
> 常用命令：
>
> | 命令 | 说明 |
> |------|------|
> | `cls` | 浏览历史对话，上下选择后 Enter 恢复 |
> | `cps` | 查看正在运行的会话，选择后 Enter 连接 |
> | `cn 描述` | 新建 Claude 会话（描述显示在 Zellij tab 名） |
> | `cnf` | 强制新建（先关掉同名旧会话） |
> | `ch 自然语言描述` | AI 搜索历史对话 |
> | `chs 关键词` | 精确搜索对话内容 |
>
> 所有会话在 Zellij/tmux 中运行，关掉终端也不丢失，随时可以用 `cps` 重新连接。

## 故障排查

**`ch: command not found`**

npm 全局 bin 目录可能不在 PATH 中：

```bash
npm root -g
npm bin -g
```

确保 `npm bin -g` 的输出路径在 PATH 中。如果用的是 nvm：

```bash
echo $PATH | tr ':' '\n' | grep nvm
```

**`ch ls` 没有显示任何历史**

```bash
ls ~/.claude/projects/
```

如果目录为空或不存在，说明用户还没用过 Claude Code。先在几个项目里用 Claude Code 对话几次，历史就会出现。

**`ch new` 报错找不到 Zellij/tmux**

```bash
which zellij && which tmux
```

安装一个复用器，或者手动指定后端：

```bash
ch config set backend tmux    # 如果装的是 tmux
ch config set backend zellij  # 如果装的是 zellij
```

**新建的会话里 Claude Code 要求重新登录**

确认 Claude Code 在普通终端里可以正常使用：

```bash
claude --version
```

如果普通终端没问题但 `ch new` 里要登录，检查 shell 配置是否正常加载：

```bash
zsh -lc "echo \$PATH" | tr ':' '\n' | head
```
