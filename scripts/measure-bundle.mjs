import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const distDir = process.argv[2] || 'apps/web/dist';
const checkBudget = process.argv.includes('--check-budget');
const BUDGET_BYTES = 200 * 1024; // 200 KB gzip

if (!fs.existsSync(distDir)) {
  console.error(`Dist directory not found: ${distDir}`);
  process.exit(1);
}

const htmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error(`index.html not found in ${distDir}`);
  process.exit(1);
}

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Find all script src tags and modulepreload links loaded initially by index.html
const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
const preloadRegex = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g;

const initialAssetPaths = new Set();

let match;
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  if (match[1].endsWith('.js')) {
    initialAssetPaths.add(match[1].replace(/^\//, ''));
  }
}

while ((match = preloadRegex.exec(htmlContent)) !== null) {
  if (match[1].endsWith('.js')) {
    initialAssetPaths.add(match[1].replace(/^\//, ''));
  }
}

console.log('\n--- First-Route JS Bundle Measurement (index.html) ---');

let totalRawBytes = 0;
let totalGzipBytes = 0;

for (const relPath of initialAssetPaths) {
  const fullPath = path.join(distDir, relPath);
  if (fs.existsSync(fullPath)) {
    const rawContent = fs.readFileSync(fullPath);
    const gzipped = zlib.gzipSync(rawContent);
    totalRawBytes += rawContent.length;
    totalGzipBytes += gzipped.length;

    console.log(
      `  ${path.basename(relPath).padEnd(35)} : ${(rawContent.length / 1024).toFixed(1).padStart(7)} KB raw | ${(gzipped.length / 1024).toFixed(1).padStart(6)} KB gzip`,
    );
  } else {
    console.warn(`  Warning: referenced asset not found on disk: ${relPath}`);
  }
}

console.log('------------------------------------------------------');
console.log(
  `Total Initial JS: ${(totalRawBytes / 1024).toFixed(1)} KB raw | ${(totalGzipBytes / 1024).toFixed(1)} KB gzip (Budget: 200.0 KB gzip)\n`,
);

if (checkBudget && totalGzipBytes > BUDGET_BYTES) {
  console.error(
    `[BUDGET EXCEEDED] First-route JS gzip is ${(totalGzipBytes / 1024).toFixed(1)} KB, which exceeds the 200 KB budget!`,
  );
  process.exit(1);
}

if (checkBudget) {
  console.log(`[BUDGET PASSED] First-route JS is within the 200 KB budget.`);
}
