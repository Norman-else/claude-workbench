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

管理环境变量中的 Anthropic API 配置：

1. 切换到 **"Environment Variables"** 标签
2. 填写必需变量：
   - **ANTHROPIC_BASE_URL**: API 基础 URL
   - **ANTHROPIC_API_KEY**: 你的 API 密钥
3. （可选）配置默认模型：
   - **ANTHROPIC_DEFAULT_HAIKU_MODEL**: 默认 Haiku 模型
   - **ANTHROPIC_DEFAULT_OPUS_MODEL**: 默认 Opus 模型
   - **ANTHROPIC_DEFAULT_SONNET_MODEL**: 默认 Sonnet 模型
4. 点击 **"Save Changes"**
5. ⚠️ **重要**: 
   - **Windows**: 重启终端或应用（自动设置到系统环境变量）
   - **macOS/Linux**: 重启终端或运行 `source ~/.zshrc`

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

**必需变量:**
```
ANTHROPIC_BASE_URL: https://api.codemirror.codes/
ANTHROPIC_API_KEY: sk-DUp1wFC0ZFtJPHlTaD7BJTlMAIKclG86lQhovR2F0pOPNTBk
```

**可选的模型默认值:**
```
ANTHROPIC_DEFAULT_HAIKU_MODEL: claude-3-5-haiku-20241022
ANTHROPIC_DEFAULT_OPUS_MODEL: claude-3-opus-20240229
ANTHROPIC_DEFAULT_SONNET_MODEL: claude-3-5-sonnet-20241022
```

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

## 技术支持

如有问题，请检查：
1. 浏览器控制台（F12）查看错误信息
2. 后端服务器日志
3. 文件权限是否正确

---

祝使用愉快！🎉

