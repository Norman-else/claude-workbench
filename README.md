# Claude Workbench

<div align="center">

🚀 **A modern web-based workbench for Claude Code CLI**

Easily manage your Claude CLI configurations, custom commands, and chat with Claude through an intuitive web interface.

</div>

## ✨ Features

- **📝 MCP Servers Management**: Configure Model Context Protocol servers with a visual interface
- **⚙️ Environment Variables**: Manage ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN in .zshrc
- **💬 Integrated Chat**: Chat directly with Claude Code CLI from the web interface
- **📜 Custom Commands**: Create and manage custom command scripts
- **🎨 Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **💾 Real-time Saving**: Instant configuration updates with visual feedback
- **🔄 Auto Refresh**: Easily reload configurations from disk

## 🛠️ Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)

### Backend
- Node.js
- Express
- CORS support

## 📦 Installation

1. **Install all dependencies:**
   ```bash
   npm run install:all
   ```

2. **Start the development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

## 🚀 Usage

### Managing MCP Servers

1. Navigate to the **MCP Servers** tab
2. Click **Add Server** to create a new MCP server configuration
3. Fill in:
   - **Server Name**: Unique identifier (e.g., `mcp-atlassian`)
   - **Command**: The command to run (e.g., `npx`)
   - **Arguments**: Comma-separated arguments
   - **Environment Variables**: JSON format environment variables
4. Click **Save Changes** to update `~/.claude.json`

### Managing Environment Variables

1. Navigate to the **Environment Variables** tab
2. Update:
   - **ANTHROPIC_BASE_URL**: Your API base URL
   - **ANTHROPIC_AUTH_TOKEN**: Your authentication token
3. Click **Save Changes** to update `.zshrc`
4. Restart your terminal or run `source ~/.zshrc` to apply changes

### Managing Commands

1. Navigate to the **Commands** tab
2. Click **Add Command** to create a new command
3. Enter command name and script content
4. Click **Create Command** to save to `~/.claude/commands/`
5. Click any command card to edit or delete

### Using the Chat Interface

1. Navigate to the **Chat** tab
2. **(Optional)** Configure the working directory where Claude CLI will run
   - Click the **Browse** button next to Working Directory
   - Navigate through directories by clicking on folder names
   - Click **Select This Directory** when you reach your desired location
   - Default is `~` (home directory)
3. **(Optional)** Add context files to include in your chat
   - Type `@` in the chat input box
   - A file browser dropdown will appear automatically
   - Search for files by typing their name
   - Click on a file to add it to context
   - Click on a folder to navigate into it
   - Remove files by clicking the X icon on the file tag
4. Type your message or command in the input field
5. Press Enter or click **Send** to chat with Claude
6. View conversation history in real-time
7. Click **Clear History** to start a new conversation

**Working Directory & Context Files:**
- **Working Directory**: 
  - Browse and select directories visually using the directory browser
  - **Quick Navigation**: 
    - Enter any path directly in the input box and press Enter or click "Go"
    - Use quick path buttons (Home, Desktop, Documents, Downloads, Root)
  - **Browse Mode**: 
    - Click on folders to navigate, use ".. (Parent Directory)" to go up
    - Filter files and folders by typing in the search box (fixed at top, always visible)
    - Use keyboard arrows to navigate while keeping the search box in view
  - The selected directory is where Claude CLI commands will execute
  - Useful for project-specific queries
- **Context Files**: 
  - Type `@` in the chat input to trigger the file selector
  - **Built-in Search**: Use the search box in the dropdown to filter files and folders in real-time
  - **Keyboard Navigation**: 
    - `↑↓` arrows to navigate through files
    - `Enter` to select the highlighted file or folder
    - `Esc` to close the file selector
  - **Navigate Folders**: Click on folders to browse into them
  - **Quick Selection**: Click on files to add them to context
  - Selected files are passed to Claude CLI with each message
  - Multiple files can be added for comprehensive context
- Both settings persist during your session and can be changed at any time.

**Slash Command Auto-Complete:**

Type `/` in the chat input to trigger an interactive command selector, just like Claude Code CLI terminal! 

**Features:**
- 🎯 **Auto-complete dropdown**: Shows all available slash commands with descriptions
- ⌨️ **Keyboard navigation**: Use `↑↓` arrows to navigate, `Enter` to select, `Esc` to close
- 🔍 **Smart filtering**: Type to filter commands in real-time (e.g., `/he` shows `/help`)
- 🔄 **Dynamic loading**: Commands are fetched from Claude CLI and your custom commands
- 🏷️ **Visual indicators**: Color-coded badges show command support status
  - ✅ **Green badge**: Fully supported in web interface
  - ⚠️ **Amber badge**: Requires interactive terminal session
  - ⚡ **Purple badge**: Custom command (from `~/.claude/commands`)

**Built-in Slash Commands:**

*Fully Supported:*
- `/help` - Show all available commands with descriptions
- `/clear` - Clear the conversation history
- `/reset` - Reset the session

*Requires Interactive Session:*
- `/add <path>` - Add files or directories to context
- `/drop <path>` - Remove files from context
- `/list` - List files in current context
- `/context` - Show current context information
- `/config` - Show configuration
- `/model` - Show or change the model

**Custom Commands:**
- All custom commands you create in the "Custom Commands" page will **automatically** appear in the slash command list
- Each custom command is marked with a purple "⚡ Custom command" badge
- The command list updates automatically when you create, modify, or delete custom commands
- Command descriptions are taken from the first line of your custom command files

> **Note:** Commands marked as "Requires Interactive Session" will display helpful guidance. Since this web interface creates a new Claude session for each message, stateful commands don't persist. For these features, use the Claude CLI directly in a terminal.

**Features:**
- Smart command detection (messages starting with `/`)
- Quick command buttons in empty state
- Real-time command hints
- Helpful guidance for interactive-only commands
- **Rich Markdown rendering** with syntax-highlighted code blocks
- Support for tables, lists, links, and blockquotes
- Beautiful code highlighting for 100+ programming languages

**Note**: The chat feature requires Claude Code CLI to be installed and accessible via the `claude` command in your PATH.

## 📁 File Structure

```
claude-config-service/
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Global styles
│   └── package.json
├── backend/              # Express backend server
│   ├── src/
│   │   └── server.js     # API endpoints
│   └── package.json
├── package.json          # Root package with scripts
└── README.md
```

## 🔧 API Endpoints

- `GET /api/claude-config` - Get Claude JSON configuration
- `POST /api/claude-config` - Update Claude JSON configuration
- `GET /api/env-vars` - Get environment variables from .zshrc
- `POST /api/env-vars` - Update environment variables in .zshrc
- `GET /api/commands` - Get all command files
- `POST /api/commands` - Create/update a command file
- `DELETE /api/commands/:name` - Delete a command file

## 🎨 Screenshots

The interface features:
- Clean, modern design with a gradient background
- Tab-based navigation for different configuration sections
- Color-coded save status (orange → green for success, red for errors)
- Responsive layout that works on all screen sizes

## ⚠️ Important Notes

- The application modifies system files (`~/.claude.json`, `~/.zshrc`, `~/.claude/commands/`)
- Always backup your configuration files before making changes
- After updating environment variables, you need to restart your terminal or run `source ~/.zshrc`

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📝 License

MIT

---

Made with ❤️ for easier Claude CLI configuration management

