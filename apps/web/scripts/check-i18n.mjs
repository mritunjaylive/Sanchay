#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webRoot = path.resolve(__dirname, '..')
const srcDir = path.resolve(webRoot, 'src')

const enPath = path.resolve(srcDir, 'i18n/locales/en.json')
const hiPath = path.resolve(srcDir, 'i18n/locales/hi.json')

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function flattenKeys(obj, prefix = '') {
  let keys = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

const enData = loadJson(enPath)
const hiData = loadJson(hiPath)

const enKeys = new Set(flattenKeys(enData))
const hiKeys = new Set(flattenKeys(hiData))

// Extract keys from source files
const usedKeys = new Set()
const usedKeyLocations = new Map() // key -> [file:line]

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
        scanDir(fullPath)
      }
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      scanFile(fullPath)
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Patterns for t('key'...), titleKey: 'key', labelKey: 'key'
  const tRegex = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g
  const titleKeyRegex = /\btitleKey:\s*['"]([a-zA-Z0-9_.-]+)['"]/g
  const labelKeyRegex = /\blabelKey:\s*['"]([a-zA-Z0-9_.-]+)['"]/g

  const matchPatterns = [tRegex, titleKeyRegex, labelKeyRegex]

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    for (const pat of matchPatterns) {
      pat.lastIndex = 0
      let match
      while ((match = pat.exec(line)) !== null) {
        const key = match[1]
        // Filter out obvious non-i18n strings or dynamic parts
        if (key && !key.includes('${') && key.includes('.')) {
          usedKeys.add(key)
          if (!usedKeyLocations.has(key)) {
            usedKeyLocations.set(key, [])
          }
          const relPath = path.relative(webRoot, filePath)
          usedKeyLocations.get(key).push(`${relPath}:${lineNum + 1}`)
        }
      }
    }
  }
}

scanDir(srcDir)

console.log(`Auditing i18n keys across codebase...`)
console.log(`Total keys in en.json: ${enKeys.size}`)
console.log(`Total keys in hi.json: ${hiKeys.size}`)
console.log(`Total keys used in code: ${usedKeys.size}`)

const missingInEn = []
const missingInHi = []

for (const key of usedKeys) {
  if (!enKeys.has(key)) {
    missingInEn.push(key)
  }
  if (!hiKeys.has(key)) {
    missingInHi.push(key)
  }
}

// Also check if hi.json is missing any key defined in en.json
const enKeysNotInHi = []
for (const key of enKeys) {
  if (!hiKeys.has(key)) {
    enKeysNotInHi.push(key)
  }
}

let hasError = false

if (missingInEn.length > 0) {
  hasError = true
  console.error(`\n❌ Keys used in code but missing from en.json (${missingInEn.length}):`)
  for (const k of missingInEn.sort()) {
    console.error(`  - ${k} (used at ${usedKeyLocations.get(k)?.[0]})`)
  }
}

if (missingInHi.length > 0) {
  hasError = true
  console.error(`\n❌ Keys used in code but missing from hi.json (${missingInHi.length}):`)
  for (const k of missingInHi.sort()) {
    console.error(`  - ${k} (used at ${usedKeyLocations.get(k)?.[0]})`)
  }
}

if (enKeysNotInHi.length > 0) {
  hasError = true
  console.error(`\n❌ Keys defined in en.json but missing from hi.json (${enKeysNotInHi.length}):`)
  for (const k of enKeysNotInHi.sort()) {
    console.error(`  - ${k}`)
  }
}

const unusedEnKeys = []
for (const key of enKeys) {
  if (!usedKeys.has(key)) {
    unusedEnKeys.push(key)
  }
}

if (unusedEnKeys.length > 0) {
  console.warn(`\n⚠️  Keys in en.json not statically detected in code (warning only, ${unusedEnKeys.length}):`)
  // show first 10
  for (const k of unusedEnKeys.slice(0, 10)) {
    console.warn(`  - ${k}`)
  }
  if (unusedEnKeys.length > 10) {
    console.warn(`  ... and ${unusedEnKeys.length - 10} more`)
  }
}

if (hasError) {
  console.error(`\n❌ i18n check failed. Please sync all keys between code, en.json, and hi.json.`)
  process.exit(1)
} else {
  console.log(`\n✅ All used keys exist in both en.json and hi.json!`)
}
