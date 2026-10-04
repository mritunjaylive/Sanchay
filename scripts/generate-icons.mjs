import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.resolve(rootDir, 'apps/web/public')
const iconsDir = path.resolve(publicDir, 'icons')

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// 1. Standard rounded icon SVG
const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
  <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
</svg>`

// 2. Full-bleed maskable SVG (no rounded corners, S+coin scaled ~70%)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(76.8, 76.8) scale(0.7)">
    <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
          fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
    <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
  </g>
</svg>`

// 3. Apple touch icon SVG (180x180, solid square background without transparency)
const appleTouchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
  <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
</svg>`

// 4. Shortcut Expense SVG (with minus/plus badge)
const shortcutExpenseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
  <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
  <!-- Expense Badge -->
  <circle cx="390" cy="390" r="90" fill="#EF4444"/>
  <line x1="335" y1="390" x2="445" y2="390" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round"/>
</svg>`

// 5. Shortcut Income SVG (with plus badge)
const shortcutIncomeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
  <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
  <!-- Income Badge -->
  <circle cx="390" cy="390" r="90" fill="#10B981"/>
  <line x1="335" y1="390" x2="445" y2="390" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round"/>
  <line x1="390" y1="335" x2="390" y2="445" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round"/>
</svg>`

// 6. Shortcut Reports SVG (with bar chart badge)
const shortcutReportsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F766E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="378" cy="130" r="34" fill="#FBBF24"/>
  <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" stroke-width="6" opacity="0.55"/>
  <!-- Reports Badge -->
  <circle cx="390" cy="390" r="90" fill="#6366F1"/>
  <line x1="355" y1="420" x2="355" y2="390" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round"/>
  <line x1="390" y1="420" x2="390" y2="360" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round"/>
  <line x1="425" y1="420" x2="425" y2="375" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round"/>
</svg>`

async function generate() {
  console.log('Generating PWA icons...')

  // 1. icon-192.png
  await sharp(Buffer.from(baseSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192.png'))

  // 2. icon-512.png
  await sharp(Buffer.from(baseSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512.png'))

  // 3. icon-512-maskable.png (full-bleed, 512x512)
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512-maskable.png'))

  // 4. shortcut-expense.png (96x96)
  await sharp(Buffer.from(shortcutExpenseSvg))
    .resize(96, 96)
    .png()
    .toFile(path.join(iconsDir, 'shortcut-expense.png'))

  // 5. shortcut-income.png (96x96)
  await sharp(Buffer.from(shortcutIncomeSvg))
    .resize(96, 96)
    .png()
    .toFile(path.join(iconsDir, 'shortcut-income.png'))

  // 6. shortcut-reports.png (96x96)
  await sharp(Buffer.from(shortcutReportsSvg))
    .resize(96, 96)
    .png()
    .toFile(path.join(iconsDir, 'shortcut-reports.png'))

  // 7. apple-touch-icon.png (180x180, solid/no transparency)
  await sharp(Buffer.from(appleTouchSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'))

  // 8. favicon.svg
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), baseSvg)

  console.log('All PWA icons and assets generated successfully!')
}

generate().catch((err) => {
  console.error(err)
  process.exit(1)
})
