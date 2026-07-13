const fs = require('fs');
const path = require('path');

const dir = '/Users/emifeaustin/.gemini/antigravity-ide/brain/289d4a15-0f8d-4493-92fd-80ebe37612ce';
const files = fs.readdirSync(dir).filter(f => f.startsWith('media__') && f.endsWith('.png'));

files.forEach(file => {
  const filepath = path.join(dir, file);
  const stat = fs.statSync(filepath);
  // Only check files from today
  if (stat.mtime > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
    // Read the first chunk to find IHDR
    const buffer = Buffer.alloc(24);
    const fd = fs.openSync(filepath, 'r');
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);
    
    // Check if it's a PNG
    if (buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      console.log(`${file} - ${width}x${height} - Size: ${stat.size} - Date: ${stat.mtime}`);
    }
  }
});
