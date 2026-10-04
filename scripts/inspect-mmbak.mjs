/**
 * scripts/inspect-mmbak.mjs — Inspects Money Manager (.mmbak / .sqlite / .db) backups.
 *
 * Usage:
 *   node scripts/inspect-mmbak.mjs <path-to-file>
 *
 * Features:
 * - Detects whether file is a ZIP-wrapped backup (.mmbak) or raw SQLite database
 * - Inspects sqlite_master to determine tables, views, and schema layout (Android vs iOS Core Data)
 * - Queries column definitions (names, types, primary keys) via PRAGMA table_info
 * - Counts rows per table
 * - CRITICAL: Never logs amounts, notes, payees, or user-identifying data.
 *
 * @see FIX_PROMPTS.md Prompt 15
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const requireFromWeb = createRequire(path.resolve('apps/web/package.json'))
const fflate = requireFromWeb('fflate')
const initSqlJs = requireFromWeb('sql.js')

async function inspectMmbak(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    console.log('Usage: node scripts/inspect-mmbak.mjs <path-to-backup-file>')
    process.exit(1)
  }

  const rawBytes = fs.readFileSync(filePath)
  console.log(`\n=== Inspecting Money Manager Backup: ${path.basename(filePath)} ===`)
  console.log(`File size: ${(rawBytes.length / 1024).toFixed(1)} KB`)

  let sqliteBuffer = null
  let isZip = false

  // Magic bytes check
  // ZIP: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
  // SQLite: "SQLite format 3\0"
  if (rawBytes.length >= 4 && rawBytes[0] === 0x50 && rawBytes[1] === 0x4b && rawBytes[2] === 0x03 && rawBytes[3] === 0x04) {
    isZip = true
    console.log('Format detected: ZIP-wrapped archive (.mmbak)')

    const unzipped = fflate.unzipSync(rawBytes)
    const fileNames = Object.keys(unzipped)
    console.log(`Entries inside ZIP archive (${fileNames.length}):`, fileNames)

    // Find SQLite file in ZIP
    for (const name of fileNames) {
      const entry = unzipped[name]
      if (entry && entry.length >= 16) {
        const header = Buffer.from(entry.subarray(0, 16)).toString('utf8')
        if (header.startsWith('SQLite format 3')) {
          console.log(`Identified SQLite database entry: "${name}" (${(entry.length / 1024).toFixed(1)} KB)`)
          sqliteBuffer = entry
          break
        }
      }
    }

    if (!sqliteBuffer) {
      // Fallback: pick any non-empty file ending in .sqlite, .db, or the largest file
      const candidate = fileNames.find((n) => n.endsWith('.sqlite') || n.endsWith('.db')) || fileNames[0]
      if (candidate && unzipped[candidate]) {
        console.log(`Fallback entry: "${candidate}"`)
        sqliteBuffer = unzipped[candidate]
      }
    }
  } else {
    console.log('Format detected: Raw SQLite file')
    sqliteBuffer = rawBytes
  }

  if (!sqliteBuffer) {
    console.error('Failed to locate SQLite database in file.')
    process.exit(1)
  }

  const SQL = await initSqlJs()
  const db = new SQL.Database(sqliteBuffer)

  // 1. Inspect sqlite_master for all tables
  const masterRes = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
  const tables = masterRes.length > 0 && masterRes[0]?.values ? masterRes[0].values.map((v) => ({ name: String(v[0]), type: String(v[1]) })) : []

  console.log(`\nFound ${tables.length} tables/views:`)

  // 2. Identify layout adapter
  const tableNames = tables.map((t) => t.name.toUpperCase())
  let layout = 'Unknown'
  if (tableNames.includes('INOUTCOME')) {
    layout = 'Android (Realbyte Money Manager)'
  } else if (tableNames.some((t) => t.startsWith('ZINOUTCOME') || t.startsWith('ZTRANSACTION'))) {
    layout = 'iOS Core Data (Realbyte Money Manager)'
  }
  console.log(`Layout Adapter: ${layout}\n`)

  // 3. Print table schemas and row counts (NO sensitive data logged)
  for (const { name, type } of tables) {
    try {
      const countRes = db.exec(`SELECT COUNT(*) FROM "${name}"`)
      const rowCount = countRes[0]?.values[0]?.[0] ?? 0

      const colRes = db.exec(`PRAGMA table_info("${name}")`)
      const cols = colRes[0]?.values.map((c) => ({
        cid: c[0],
        name: c[1],
        type: c[2],
        notnull: c[3],
        dflt_value: c[4],
        pk: c[5],
      })) ?? []

      console.log(`\n--- ${type.toUpperCase()}: ${name} (Rows: ${rowCount}) ---`)
      const colList = cols.map((c) => `${c.name} (${c.type}${c.pk ? ', PK' : ''})`).join(', ')
      console.log(`  Columns: ${colList}`)
    } catch (err) {
      console.warn(`  Could not inspect table ${name}: ${err.message}`)
    }
  }

  console.log('\nInspection complete. No sensitive amounts, notes, or payees were logged.\n')
  db.close()
}

const targetPath = process.argv[2]
if (!targetPath) {
  console.log('Usage: node scripts/inspect-mmbak.mjs <path-to-mmbak-or-sqlite-file>')
  console.log('Example: node scripts/inspect-mmbak.mjs backup.mmbak')
} else {
  inspectMmbak(targetPath).catch((err) => {
    console.error('Inspection failed:', err)
    process.exit(1)
  })
}
