const sharp = require('sharp');

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
    <rect width="${size}" height="${size}" fill="#000000" rx="100" />
    <text x="50%" y="55%" font-family="Arial, sans-serif" font-weight="bold" font-size="200" fill="url(#grad)" text-anchor="middle" dominant-baseline="middle" letter-spacing="-5">DXB</text>
  </svg>
  `;

  await sharp(Buffer.from(svgText))
    .png()
    .toFile('/Users/emifeaustin/Desktop/DXBmoviesAI/public/icons/icon-512-v5.png');
    
  await sharp(Buffer.from(svgText))
    .resize(192, 192)
    .png()
    .toFile('/Users/emifeaustin/Desktop/DXBmoviesAI/public/icons/icon-192-v5.png');
    
  await sharp(Buffer.from(svgText))
    .resize(180, 180)
    .png()
    .toFile('/Users/emifeaustin/Desktop/DXBmoviesAI/public/icons/apple-touch-icon-v5.png');

  console.log("Icons successfully generated with Sharp!");
}

createIcon().catch(console.error);
