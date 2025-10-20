import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const HOME_DIR = os.homedir();
const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const ZSHRC_PATH = path.join(HOME_DIR, '.zshrc');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');

// Helper function to ensure file exists
async function ensureFileExists(filePath, defaultContent = '') {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContent);
  }
}

// Get Claude JSON configuration
app.get('/api/claude-config', async (req, res) => {
  try {
    await ensureFileExists(CLAUDE_JSON_PATH, '{}');
    const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(content || '{}');
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Claude JSON configuration
app.post('/api/claude-config', async (req, res) => {
  try {
    const config = req.body;
    await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get environment variables from .zshrc
app.get('/api/env-vars', async (req, res) => {
  try {
    await ensureFileExists(ZSHRC_PATH, '');
    const content = await fs.readFile(ZSHRC_PATH, 'utf-8');
    const lines = content.split('\n');
    
    let baseUrl = '';
    let authToken = '';
    
    for (const line of lines) {
      if (line.includes('ANTHROPIC_BASE_URL=')) {
        const match = line.match(/export ANTHROPIC_BASE_URL="?([^"]+)"?/);
        if (match) baseUrl = match[1];
      }
      if (line.includes('ANTHROPIC_AUTH_TOKEN=')) {
        const match = line.match(/export ANTHROPIC_AUTH_TOKEN="?([^"]+)"?/);
        if (match) authToken = match[1];
      }
    }
    
    res.json({ baseUrl, authToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update environment variables in .zshrc
app.post('/api/env-vars', async (req, res) => {
  try {
    const { baseUrl, authToken } = req.body;
    let content = await fs.readFile(ZSHRC_PATH, 'utf-8');
    let lines = content.split('\n');
    
    // Find the section markers
    const startMarker = '# Claude Code & Codex Environment Variables';
    const endMarker = '# End Claude Code & Codex Environment Variables';
    
    let startIndex = lines.findIndex(line => line.includes(startMarker));
    let endIndex = lines.findIndex(line => line.includes(endMarker));
    
    // Remove old section if exists
    if (startIndex !== -1 && endIndex !== -1) {
      lines.splice(startIndex, endIndex - startIndex + 1);
    }
    
    // Add new section
    const newSection = [
      '',
      startMarker,
      `export ANTHROPIC_BASE_URL="${baseUrl}"`,
      `export ANTHROPIC_AUTH_TOKEN="${authToken}"`,
      '',
      `export OPENAI_BASE_URL="${baseUrl}/v1"`,
      `export OPENAI_API_KEY="${authToken}"`,
      endMarker
    ];
    
    lines.push(...newSection);
    
    await fs.writeFile(ZSHRC_PATH, lines.join('\n'));
    res.json({ success: true, message: 'Environment variables updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of command files
app.get('/api/commands', async (req, res) => {
  try {
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    const files = await fs.readdir(CLAUDE_COMMANDS_DIR);
    const commands = [];
    
    for (const file of files) {
      const filePath = path.join(CLAUDE_COMMANDS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      commands.push({ name: file, content });
    }
    
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save a command file
app.post('/api/commands', async (req, res) => {
  try {
    const { name, content } = req.body;
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    const filePath = path.join(CLAUDE_COMMANDS_DIR, name);
    await fs.writeFile(filePath, content);
    res.json({ success: true, message: 'Command saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a command file
app.delete('/api/commands/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = path.join(CLAUDE_COMMANDS_DIR, name);
    await fs.unlink(filePath);
    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List files in directory
app.post('/api/list-files', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ error: 'Directory is required' });
    }
    
    // Expand ~ to home directory
    const expandedDir = directory.startsWith('~') 
      ? directory.replace('~', os.homedir())
      : directory;
    
    // Read directory contents
    const files = await fs.readdir(expandedDir, { withFileTypes: true });
    
    // Format the file list
    const fileList = files.map(file => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      path: path.join(directory, file.name)
    }));
    
    // Sort: directories first, then files, alphabetically
    fileList.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({ files: fileList, directory: expandedDir });
  } catch (error) {
    res.status(500).json({ error: error.message, files: [] });
  }
});

// Get available slash commands (built-in + custom)
app.get('/api/slash-commands', async (req, res) => {
  try {
    // Built-in commands (from Claude CLI documentation)
    const builtInCommands = [
      { command: '/help', description: 'Show all available commands', category: 'fully-supported' },
      { command: '/clear', description: 'Clear the conversation history', category: 'fully-supported' },
      { command: '/reset', description: 'Reset the session', category: 'fully-supported' },
      { command: '/add <path>', description: 'Add files or directories to context', category: 'interactive' },
      { command: '/drop <path>', description: 'Remove files from context', category: 'interactive' },
      { command: '/list', description: 'List files in current context', category: 'interactive' },
      { command: '/context', description: 'Show current context information', category: 'interactive' },
      { command: '/config', description: 'Show configuration', category: 'interactive' },
      { command: '/model', description: 'Show or change the model', category: 'interactive' },
    ];

    // Get custom commands from ~/.claude/commands directory
    const customCommands = [];
    try {
      await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
      const files = await fs.readdir(CLAUDE_COMMANDS_DIR);
      
      for (const file of files) {
        const filePath = path.join(CLAUDE_COMMANDS_DIR, file);
        const stats = await fs.stat(filePath);
        
        // Only include regular files, not directories
        if (stats.isFile()) {
          // Read file content and extract description
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          let description = 'Custom command';
          
          // Check if file starts with YAML frontmatter (---)
          if (lines[0]?.trim() === '---') {
            // Find the description field in frontmatter
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim() === '---') break; // End of frontmatter
              
              const match = lines[i].match(/^description:\s*(.+)$/);
              if (match) {
                description = match[1].trim();
                break;
              }
            }
          } else {
            // No frontmatter, use first non-empty line
            const firstLine = lines.find(line => line.trim());
            if (firstLine) {
              description = firstLine.trim().substring(0, 100);
              if (firstLine.length > 100) description += '...';
            }
          }
          
          // Remove .md extension if present for the command name
          const commandName = file.replace(/\.md$/, '');
          
          customCommands.push({
            command: `/${commandName}`,
            description: description,
            category: 'custom',
            isCustom: true
          });
        }
      }
    } catch (error) {
      console.warn('Failed to read custom commands:', error.message);
    }

    // Combine built-in and custom commands
    const allCommands = [...builtInCommands, ...customCommands];
    
    res.json({ commands: allCommands });
  } catch (error) {
    console.error('Failed to get slash commands:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat with Claude Code CLI
app.post('/api/chat', async (req, res) => {
  try {
    const { message, isCommand, workingDirectory, contextFiles } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Handle slash commands specially
    const trimmedMessage = message.trim();
    
    // /help command
    if (trimmedMessage === '/help' || trimmedMessage === '/?') {
        const helpText = `Available Claude CLI commands:
          
/help or /?     - Show this help message
/clear          - Clear the current context (Note: Context is session-based)
/add <path>     - Add files or directories to context
/drop <path>    - Remove files from context
/list           - List files in current context
/context        - Show current context information
/config         - Show configuration
/model          - Show or change the model

You can also type regular messages to chat with Claude.`;
          
          return res.json({ 
            response: helpText,
            success: true 
          });
        }
        
        // /clear command
        if (trimmedMessage === '/clear') {
          return res.json({ 
            response: '✓ Context cleared. The conversation context has been reset.\n\nNote: Since this web interface creates a new Claude session for each message, the context is naturally isolated between messages. To maintain context across messages, you would need to use the Claude CLI directly in a terminal.',
            success: true 
          });
        }
        
        // For other slash commands, try to execute them with claude CLI
        // These commands work better in an interactive session, so we'll try a different approach
        if (trimmedMessage.startsWith('/')) {
          const command = trimmedMessage.split(' ')[0];
          
          // Commands that require interactive session
          const interactiveCommands = ['/list', '/context', '/config', '/model', '/add', '/drop'];
          
          if (interactiveCommands.some(cmd => trimmedMessage.startsWith(cmd))) {
            return res.json({
              response: `⚠️ The command "${command}" requires an interactive Claude CLI session.\n\nThis web interface sends each message as a separate request, which doesn't support stateful commands like ${command}.\n\nTo use this command, please:\n1. Open a terminal\n2. Run: claude\n3. Use the ${command} command in the interactive session\n\nFor chat messages without maintaining context, you can continue using this web interface.`,
              success: true
            });
          }
        }

    // Call claude code cli
    // Note: This assumes 'claude' command is available in PATH
    // Using printf to properly handle special characters and newlines
    const escapedMessage = message.replace(/'/g, "'\\''");
    
    // Expand ~ to home directory
    const expandedWorkingDir = workingDirectory && workingDirectory.startsWith('~') 
      ? workingDirectory.replace('~', os.homedir())
      : workingDirectory || process.cwd();
    
    // Build context files string
    const filesArg = contextFiles && contextFiles.length > 0
      ? contextFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
      : '';
    
    // For slash commands, pass them directly
    // For regular messages, pipe them to claude with context files
    let command;
    if (filesArg) {
      // Include context files in the command
      command = `cd '${expandedWorkingDir.replace(/'/g, "'\\''")}' && printf '%s\\n' '${escapedMessage}' | claude ${filesArg}`;
    } else {
      command = `cd '${expandedWorkingDir.replace(/'/g, "'\\''")}' && printf '%s\\n' '${escapedMessage}' | claude`;
    }
    
    const { stdout, stderr } = await execPromise(command, {
      timeout: 60000, // 60 seconds timeout (Claude might take longer to respond)
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      shell: '/bin/bash', // Use bash shell for better compatibility
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for cleaner output
    });

    // Claude CLI might output some info to stderr, but that's usually okay
    if (stderr && !stderr.includes('Processing') && !stderr.includes('Thinking')) {
      console.warn('Claude CLI stderr:', stderr);
    }

    const response = stdout.trim();
    
    res.json({ 
      response: response || 'Claude did not return a response.',
      success: true 
    });
  } catch (error) {
    console.error('Failed to chat with Claude:', error);
    
    // Check if it's a timeout error
    if (error.killed) {
      res.status(500).json({ 
        error: 'Request timeout',
        response: 'The request took too long. Please try a simpler question or try again.'
      });
    } else {
      res.status(500).json({ 
        error: error.message,
        response: 'Failed to communicate with Claude Code CLI. Please ensure it is installed and configured correctly.\n\nError: ' + error.message
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Claude Config Service backend running on http://localhost:${PORT}`);
});

