import fs from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2] || 'apps/web/dist';

if (!fs.existsSync(distDir)) {
  console.error(`Directory not found: ${distDir}`);
  process.exit(1);
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

const files = getAllFiles(distDir);
let violations = 0;

const jwtRegex = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

for (const file of files) {
  // Only inspect text / code assets
  if (!/\.(js|html|css|json|map|webmanifest)$/.test(file)) {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');

  // Check 1: direct string "service_role"
  if (content.includes('service_role')) {
    console.error(`[SECURITY VIOLATION] Literal 'service_role' found in: ${file}`);
    violations++;
  }

  // Check 2: encoded JWT with service_role claim
  let match;
  while ((match = jwtRegex.exec(content)) !== null) {
    const token = match[0];
    const parts = token.split('.');
    if (parts.length >= 2) {
      try {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed.role === 'service_role') {
          console.error(`[SECURITY VIOLATION] JWT with 'service_role' claim found in: ${file}`);
          violations++;
        }
      } catch {
        // Not JSON payload, ignore
      }
    }
  }
}

if (violations > 0) {
  console.error(`\nFound ${violations} secret/service_role violations in bundle!`);
  process.exit(1);
}

console.log(`Security check passed: scanned ${files.length} files in ${distDir}, no service_role secrets found.`);
