const sharp = require('sharp');
const fs = require('fs');

async function optimize(file, width) {
    if (!fs.existsSync(file)) return;
    const tempFile = `temp_${file}`;
    let pipeline = sharp(file);
    if (width) {
        pipeline = pipeline.resize(width);
    }
    await pipeline.webp({ quality: 80 }).toFile(tempFile);
    fs.renameSync(tempFile, file);
    console.log(`Optimized ${file}`);
}

(async () => {
    await optimize('logo.webp', 128);
    await optimize('wathiqat-bay-brak-1002h-fadl-sabbal-alain.webp');
    await optimize('ansar-wadi-al-shati.webp');
})();
