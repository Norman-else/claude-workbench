# 快速启动指南 🚀

## 第一次使用

### 1. 安装所有依赖

```bash
cd /Users/normanzuo/PersonalRepos/claude-config-service
npm run install:all
```

这个命令会自动安装：
- 根目录的依赖（用于并发运行前后端）
- frontend 文件夹的依赖（React + Vite）
- backend 文件夹的依赖（Express）

### 2. 启动开发服务器

```bash
npm run dev
```

这将同时启动：
- **前端**: http://localhost:3000 （自动在浏览器中打开）
- **后端**: http://localhost:3001 （API 服务器）

## 功能介绍

### 💬 Chat 聊天

直接在网页上与 Claude Code CLI 对话：

1. 切换到 **"Chat"** 标签
2. 在输入框中输入你的问题或命令
3. 按回车或点击 **"Send"** 发送
4. 实时查看 Claude 的回复
5. 点击 **"Clear History"** 清空对话历史

**支持的斜杠命令：**
- `/help` - 显示所有可用命令
- `/clear` - 清除当前上下文
- `/add <path>` - 添加文件或目录到上下文
- `/drop <path>` - 从上下文中移除文件
- `/list` - 列出当前上下文中的文件
- `/context` - 显示当前上下文信息
- `/config` - 显示配置
- `/model` - 显示或更改模型

**提示**：
- 输入 `/` 开头会自动提示这是一个命令
- 点击快捷按钮可快速输入常用命令
- 空状态下显示快捷命令按钮

**注意**：需要确保 `claude` 命令已安装并在 PATH 中可用。

### 📡 MCP Servers 配置

管理 `~/.claude.json` 文件中的 MCP 服务器配置：

1. 点击 **"Add Server"** 添加新服务器
2. 填写服务器信息：
   - **Server Name**: 例如 `mcp-atlassian`
   - **Command**: 例如 `npx`
   - **Arguments**: 例如 `-y, @modelcontextprotocol/server-atlassian`
   - **Environment Variables**: JSON 格式，例如：
     ```json
     {
       "JIRA_URL": "https://your-domain.atlassian.net",
       "JIRA_EMAIL": "your-email@example.com"
     }
     ```
3. 点击 **"Save Changes"** 保存

### ⚙️ 环境变量配置

管理 `.zshrc` 中的 Anthropic API 配置：

1. 切换到 **"Environment Variables"** 标签
2. 填写：
   - **ANTHROPIC_BASE_URL**: API 基础 URL
   - **ANTHROPIC_AUTH_TOKEN**: 你的认证令牌
3. 点击 **"Save Changes"**
4. ⚠️ **重要**: 保存后需要重启终端或运行：
   ```bash
   source ~/.zshrc
   ```

### 📝 自定义命令

管理 `~/.claude/commands/` 目录下的命令文件：

1. 切换到 **"Commands"** 标签
2. 输入命令名称（例如 `deploy.sh`）
3. 输入命令内容
4. 点击 **"Add Command"** 保存

## 界面特性

✨ **现代化设计**
- 渐变背景
- 流畅的动画过渡
- 响应式布局

🎨 **直观的侧边栏导航**
- 💬 聊天图标 - Chat
- 🖥️ 服务器图标 - MCP Servers
- 🔧 终端图标 - Environment Variables  
- 📝 命令图标 - Commands

💾 **实时保存反馈**
- 橙色按钮 → 准备保存
- 绿色按钮 ✓ → 保存成功
- 红色按钮 ✗ → 保存失败

🔄 **快速刷新**
- 点击右上角的刷新按钮重新加载所有配置

## 示例配置

### MCP Server 示例

**服务器名称**: `mcp-atlassian`

```
Command: npx
Arguments: -y, @modelcontextprotocol/server-atlassian
Environment Variables:
{
  "JIRA_URL": "https://your-domain.atlassian.net",
  "JIRA_EMAIL": "your-email@example.com",
  "JIRA_API_TOKEN": "your-api-token"
}
```

### 环境变量示例

```
ANTHROPIC_BASE_URL: https://api.codemirror.codes/
ANTHROPIC_AUTH_TOKEN: sk-DUp1wFC0ZFtJPHlTaD7BJTlMAIKclG86lQhovR2F0pOPNTBk
```

## Chat 功能使用指南

### 基本使用

1. 点击左侧菜单的 **Chat** 标签
2. 在聊天输入框中输入你的问题
3. 按 Enter 或点击 **Send** 发送消息
4. 查看 Claude 的回复

### Slash Command 自动补全 ✨

**全新交互方式！** 在聊天输入框中输入 `/` 即可触发 slash command 选择器，就像在 Claude Code CLI 终端中一样！

**功能特性：**
- 🎯 **自动补全下拉框**：显示所有可用的 slash commands 及其描述
- ⌨️ **键盘导航**：使用 `↑↓` 箭头键导航，`Enter` 选择，`Esc` 关闭
- 🔍 **智能过滤**：继续输入以实时过滤命令（例如输入 `/he` 会显示 `/help`）
- 🔄 **实时动态加载**：命令列表从 Claude CLI 和你的自定义命令中实时获取
- 🏷️ **视觉指示器**：彩色标签显示命令支持状态
  - ✅ **绿色标签**：在网页界面中完全支持
  - ⚠️ **琥珀色标签**：需要在终端中的交互式会话
  - ⚡ **紫色标签**：自定义命令（来自 `~/.claude/commands` 目录）

**内置命令：**
- `/help` - 显示所有可用命令及其说明
- `/clear` - 清除当前上下文
- `/reset` - 重置会话
- `/add <path>` - 添加文件或目录到上下文（需要交互式会话）
- `/drop <path>` - 从上下文中移除文件（需要交互式会话）
- `/list` - 列出当前上下文中的文件（需要交互式会话）
- `/context` - 显示当前上下文信息（需要交互式会话）
- `/config` - 显示配置（需要交互式会话）
- `/model` - 显示或更改模型（需要交互式会话）

**自定义命令：**
- 你在 "Custom Commands" 页面创建的所有自定义命令会**自动**出现在 slash command 列表中
- 每个自定义命令都有紫色的 "⚡ Custom command" 标签
- 创建、修改或删除自定义命令后，slash command 列表会自动更新
- 命令描述取自你的自定义命令文件的第一行内容

**使用示例：**
```
步骤1: 在聊天输入框中输入 /
步骤2: 自动弹出 slash command 选择器（蓝色渐变背景）
步骤3: 使用 ↑↓ 箭头键选择命令，或继续输入过滤（如 /he）
步骤4: 按 Enter 选中命令
步骤5: 命令自动填入输入框，按 Enter 发送

全程无需鼠标！⚡
```

### 设置工作目录

Chat 功能支持可视化浏览和选择 Claude CLI 的工作目录，这样 Claude 能更好地理解你的项目上下文。

**操作步骤：**
1. 在 Chat 页面顶部找到 **Working Directory** 输入框
2. 点击右侧的 **Browse** 按钮
3. 在弹出的目录浏览器中有**三种导航方式**：

**方式一：直接输入路径**
- 在顶部路径输入框中输入目标路径
- 按 Enter 或点击 **Go** 按钮跳转
- 示例：`~/PersonalRepos/my-project` 或 `/Users/yourname/Desktop`

**方式二：快捷路径**
- 点击快捷按钮快速跳转到常用目录：
  - 🏠 Home - 用户主目录
  - 🖥️ Desktop - 桌面
  - 📄 Documents - 文档
  - 📥 Downloads - 下载
  - 💾 Root - 根目录

**方式三：浏览模式**
- 使用过滤框搜索文件和文件夹（**搜索框固定在顶部**，始终可见）
- 点击文件夹进入该目录
- 点击 ".. (Parent Directory)" 返回上级目录
- 浏览到目标目录后，点击 **Select This Directory** 确认选择
- **支持键盘导航**：
  - `↑↓` 箭头键在文件列表中导航（搜索框始终可见）
  - `Enter` 键进入选中的文件夹或添加选中的文件
  - 打开浏览器后自动聚焦到搜索框，可直接使用键盘

**默认值**：`~`（用户主目录）

**使用技巧：**
- 对于深层目录，推荐使用"直接输入路径"方式
- 对于常用目录，使用"快捷路径"最快
- 不确定路径时，使用"浏览模式"逐级查找
- **键盘党福音**：打开后直接用箭头键导航，全程无需鼠标！

### 添加上下文文件

你可以通过 `@` 符号快速添加文件到聊天上下文中，让 Claude 分析这些文件的内容。

**操作步骤：**
1. 在聊天输入框中输入 `@` 符号
2. 自动弹出文件选择器，显示当前工作目录下的文件和文件夹
3. **使用搜索框**：在弹出窗口顶部的搜索框中输入文件名进行实时过滤
4. 有两种方式选择文件：
   - **直接点击文件**：将文件添加到上下文
   - **浏览文件夹**：点击文件夹进入，继续浏览
5. 选中的文件会显示为标签，点击 X 可以移除
6. 按 `Esc` 键关闭文件选择器

**使用技巧：**
- 输入 `@` 后，搜索框会自动获得焦点
- 在搜索框中输入关键词实时过滤文件（如输入 "test" 只显示包含 test 的文件）
- 点击文件夹图标（蓝色）进入子目录，搜索框会自动清空
- 点击文件图标（灰色）添加到上下文
- 按 `Esc` 键可以快速关闭文件选择器并返回到聊天输入

**键盘导航：**
- ⬆️ `↑` 箭头键：向上移动选择
- ⬇️ `↓` 箭头键：向下移动选择
- ✅ `Enter` 键：选中当前高亮的文件或文件夹
- ❌ `Esc` 键：关闭文件选择器
- 💡 当前选中项会有蓝色背景高亮显示
- 💡 自动滚动：选中项会自动滚动到可见区域

**搜索功能：**
- ✅ 实时过滤：输入即搜索，无需按回车
- ✅ 大小写不敏感：搜索 "APP" 和 "app" 效果一样
- ✅ 部分匹配：搜索 "con" 可以匹配 "config.ts"、"constants.js" 等
- ✅ 自动聚焦：打开文件选择器后搜索框自动获得焦点
- ✅ 搜索时重置：每次输入都会重置选择到第一项

**示例场景 1：使用搜索查找文件**
```
Working Directory: ~/PersonalRepos/my-app

步骤1: 在聊天框输入 @
步骤2: 在搜索框输入 "app"
步骤3: 找到 App.tsx，点击添加
步骤4: 再次输入 @
步骤5: 在搜索框输入 "pack"
步骤6: 找到 package.json，点击添加

Context Files: 
  ✓ src/App.tsx
  ✓ package.json
  
你的问题：这个项目使用了什么框架？有哪些依赖？
```

**示例场景 2：浏览文件夹**
```
Working Directory: ~/PersonalRepos/my-app

步骤1: 在聊天框输入 @
步骤2: 点击 src 文件夹（蓝色）进入
步骤3: 在搜索框输入 "comp" 过滤组件文件
步骤4: 点击 Button.tsx 添加
步骤5: 点击 Card.tsx 添加

Context Files:
  ✓ src/components/Button.tsx
  ✓ src/components/Card.tsx
  
你的问题：这两个组件的设计模式有什么不同？
```

**示例场景 3：使用键盘导航（最快！）**
```
Working Directory: ~/PersonalRepos/my-app

步骤1: 在聊天框输入 @
步骤2: 在搜索框输入 "app"（搜索框自动获得焦点）
步骤3: 按 ↓ 箭头选择 App.tsx（蓝色高亮）
步骤4: 按 Enter 添加
步骤5: 再次输入 @
步骤6: 输入 "pack"
步骤7: 按 Enter（默认选中第一项）

Context Files:
  ✓ src/App.tsx
  ✓ package.json
  
全程无需鼠标！⚡
```

Claude 将同时分析所有上下文文件的内容来回答你的问题。

### 斜杠命令

Chat 支持一些特殊的斜杠命令：

- `/help` - 查看所有可用命令
- `/clear` - 清除上下文（会显示说明）
- 其他命令（如 `/list`、`/context`）需要在终端的交互式会话中使用

### Markdown 支持

聊天界面完全支持 Markdown 格式，Claude 的回复会被美化渲染：

**支持的格式：**
- ✅ **代码块**：带语法高亮，支持 100+ 编程语言
- ✅ **行内代码**：使用 `` `code` `` 格式
- ✅ **标题**：`#`、`##`、`###` 等
- ✅ **列表**：有序列表和无序列表
- ✅ **链接**：可点击的超链接
- ✅ **引用**：`>` 引用块
- ✅ **表格**：完整的表格支持
- ✅ **粗体/斜体**：`**粗体**` 和 `*斜体*`

**示例效果：**

当你询问 Claude 关于代码的问题时，它会返回格式化的代码：

````markdown
这是一个 React 组件示例：

```typescript
function HelloWorld() {
  return <div>Hello, World!</div>;
}
```

**特点：**
1. 语法高亮
2. 易于阅读
3. 可直接复制
````

所有这些都会被自动渲染成美观的格式！

## 常见问题

### Q: 配置保存后不生效？

**A**: 对于环境变量，需要重启终端或运行 `source ~/.zshrc`

### Q: 如何备份配置？

**A**: 建议定期备份以下文件：
- `~/.claude.json`
- `~/.zshrc`
- `~/.claude/commands/`

### Q: 可以同时编辑多个服务器吗？

**A**: 可以！你可以添加和编辑多个 MCP 服务器，最后统一保存。

### Q: 聊天功能中的斜杠命令为什么不工作？

**A**: 大部分斜杠命令（如 `/add`, `/list`, `/context` 等）需要在交互式的 Claude CLI 会话中使用。这个网页界面每次发送消息都会创建一个新的会话，无法保持状态。

**支持的命令：**
- `/help` - 显示帮助信息
- `/clear` - 清除上下文（会显示说明）

**需要终端的命令：**
- `/add`, `/drop`, `/list`, `/context`, `/config`, `/model`

如需使用这些命令，请在终端中运行 `claude` 进入交互式会话。

## 技术支持

如有问题，请检查：
1. 浏览器控制台（F12）查看错误信息
2. 后端服务器日志
3. 文件权限是否正确

---

祝使用愉快！🎉

