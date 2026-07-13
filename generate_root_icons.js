const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createIcon() {
  const size = 512;
  
  // Create an SVG with the DXB text and gradient
  const svgText = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#a855f7;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#ec4899;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="#0b0b0b" />
    <text x="50%" y="55%" font-family="Arial, sans-serif" font-weight="bold" font-size="220" fill="url(#grad)" text-anchor="middle" dominant-baseline="middle" letter-spacing="-5">DXB</text>
  </svg>
  `;

  const publicDir = '/Users/emifeaustin/Desktop/DXBmoviesAI/public';

  await sharp(Buffer.from(svgText))
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
    
  await sharp(Buffer.from(svgText))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
    
  await sharp(Buffer.from(svgText))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
    
  await sharp(Buffer.from(svgText))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon-precomposed.png'));

  // Save one copy for the user to view in artifacts
  await sharp(Buffer.from(svgText))
    .png()
    .toFile('/Users/emifeaustin/.gemini/antigravity-ide/brain/289d4a15-0f8d-4493-92fd-80ebe37612ce/scratch/Clean_DXB_Logo.png');

  console.log("Root icons successfully generated!");
}

createIcon().catch(console.error);
