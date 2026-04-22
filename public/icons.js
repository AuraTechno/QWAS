
const fs = require('fs');
const { createCanvas } = require('canvas');

// Функция создания иконки
function createIcon(size, text = 'Q', bgColor = '#667eea', textColor = '#ffffff') {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Фон
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  
  // Градиент для фона
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Текст
  ctx.fillStyle = textColor;
  ctx.font = `bold ${size * 0.6}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.05);
  
  return canvas;
}

// Функция создания сплэш-скрина
function createSplash(width, height, bgColor = '#0a0a0a', textColor = '#ffffff') {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Фон
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  // Иконка по центру
  const iconSize = Math.min(width, height) * 0.25;
  const iconX = (width - iconSize) / 2;
  const iconY = (height - iconSize) / 2 - iconSize * 0.3;
  
  // Градиент для иконки
  const gradient = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  
  // Рисуем круглую иконку
  ctx.beginPath();
  ctx.arc(width / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Текст Q в иконке
  ctx.fillStyle = textColor;
  ctx.font = `bold ${iconSize * 0.5}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Q', width / 2, iconY + iconSize / 2 + iconSize * 0.05);
  
  // Текст QWAS под иконкой
  ctx.fillStyle = textColor;
  ctx.font = `bold ${iconSize * 0.3}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QWAS', width / 2, iconY + iconSize + iconSize * 0.2);
  
  // Индикатор загрузки
  ctx.font = `${iconSize * 0.12}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#888';
  ctx.fillText('Загрузка...', width / 2, height - iconSize * 0.3);
  
  return canvas;
}

// Создаем папку public если нет
if (!fs.existsSync('./public')) {
  fs.mkdirSync('./public', { recursive: true });
}

// Создаем иконки
console.log('🎨 Создаем иконки...');

const iconSizes = [16, 32, 120, 152, 167, 180, 192, 512];
iconSizes.forEach(size => {
  const canvas = createIcon(size);
  const buffer = canvas.toBuffer('image/png');
  const filename = size <= 32 ? `favicon-${size}.png` : `icon-${size}.png`;
  fs.writeFileSync(`./public/${filename}`, buffer);
  console.log(`  ✅ ${filename}`);
});

// Создаем сплэш-скрины для iOS
console.log('📱 Создаем сплэш-скрины...');

const splashSizes = [
  { name: '2048x2732', width: 2048, height: 2732 },
  { name: '1668x2388', width: 1668, height: 2388 },
  { name: '1536x2048', width: 1536, height: 2048 },
  { name: '1242x2688', width: 1242, height: 2688 },
  { name: '1170x2532', width: 1170, height: 2532 },
  { name: '1284x2778', width: 1284, height: 2778 },
  { name: '1125x2436', width: 1125, height: 2436 },
  { name: '828x1792', width: 828, height: 1792 },
  { name: '750x1334', width: 750, height: 1334 },
  { name: '640x1136', width: 640, height: 1136 }
];

splashSizes.forEach(size => {
  const canvas = createSplash(size.width, size.height);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`./public/splash-${size.name}.png`, buffer);
  console.log(`  ✅ splash-${size.name}.png`);
});

console.log('✨ Готово! Все иконки и сплэш-скрины созданы.');
