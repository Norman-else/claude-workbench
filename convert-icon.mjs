import fs from 'fs';
import { spawn } from 'child_process';

const sourcePath = 'C:\\Users\\Administrator\\Downloads\\claude-ai-logo-rounded-hd-free-png.png';
const targetPaths = [
  'desktop/assets/icon.png',
  'desktop/assets/tray-icon.png',
  'desktop/assets/tray-iconTemplate.png'
];

// Simply copy the file
for (const target of targetPaths) {
  try {
    fs.copyFileSync(sourcePath, target);
    console.log(`✅ Copied to ${target}`);
  } catch (error) {
    console.error(`❌ Failed to copy to ${target}:`, error.message);
  }
}

console.log('\n✅ All icons copied successfully!');

