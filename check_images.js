const sharp = require('sharp');
const fs = require('fs');

const files = [
    'logo.webp',
    'wathiqat-bay-brak-1002h-fadl-sabbal-alain.webp',
    'ansar-wadi-al-shati.webp'
];

async function checkMetadata() {
    for (const file of files) {
        if (fs.existsSync(file)) {
            const metadata = await sharp(file).metadata();
            console.log(`${file}: ${metadata.width}x${metadata.height}, size: ${metadata.size}`);
        } else {
            console.log(`${file} not found`);
        }
    }
}

checkMetadata();
