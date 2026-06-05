// scripts/generate-icons.js
// Генерация PNG-иконок из SVG для PWA manifest.
// Требует `sharp`: npm i sharp --save
// Использование: node scripts/generate-icons.js

const fs = require("fs");
const path = require("path");

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("Нужен пакет sharp. Установите: npm i sharp --save");
    process.exit(1);
  }

  const src = path.join(__dirname, "..", "public", "icons", "icon.svg");
  const outDir = path.join(__dirname, "..", "public", "icons");
  if (!fs.existsSync(src)) {
    console.error("Не найден", src);
    process.exit(1);
  }

  const sizes = [72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
  const svgBuf = fs.readFileSync(src);
  for (const sz of sizes) {
    const out = path.join(outDir, `icon-${sz}.png`);
    await sharp(svgBuf, { density: 384 })
      .resize(sz, sz, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log("Создан", out);
  }

  // Maskable: добавляем padding 10% для safe-zone
  const maskableSvg = path.join(__dirname, "..", "public", "icons", "icon-maskable.svg");
  if (fs.existsSync(maskableSvg)) {
    const buf = fs.readFileSync(maskableSvg);
    for (const sz of [192, 512]) {
      const out = path.join(outDir, `icon-maskable-${sz}.png`);
      await sharp(buf, { density: 384 })
        .resize(sz, sz, { fit: "contain", background: { r: 23, g: 33, b: 43, alpha: 1 } })
        .png({ compressionLevel: 9 })
        .toFile(out);
      console.log("Создан", out);
    }
  }
  console.log("Готово!");
}

main().catch(e => { console.error(e); process.exit(1); });
