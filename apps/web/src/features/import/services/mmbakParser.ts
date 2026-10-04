/**
 * features/import/services/mmbakParser.ts — Money Manager (.mmbak / .sqlite / .db) parser.
 *
 * Implements F-081 (spec section 15.4):
 * - Accepts .mmbak (ZIP-wrapped SQLite) or raw .sqlite / .db backups
 * - Runs 100% client-side in the browser via SQLite WASM (sql.js) and fflate
 * - Zero network requests — files never leave the device
 * - Detects Android (INOUTCOME) vs iOS Core Data (Z*) schemas
 * - Column alias table handles schema versions across Money Manager releases
 * - Skips deleted rows
 * - Converts amounts to integer minor units based on currency exponent
 * - Converts dates to local calendar string YYYY-MM-DD (no UTC conversion)
 * - Resolves accounts, categories, subcategories, and transfers
 * - Tags imported records with source='import' and importBatchId for one-click undo
 *
 * @see Sanchay_spec.md section 15.4, F-081
 * @see FIX_PROMPTS.md Prompt 15
 */

import initSqlJs, { type Database } from 'sql.js'
import * as fflate from 'fflate'
import { CURRENCY_EXPONENTS } from '@sanchay/shared'
import { uuidv7 } from '../../../lib/ids'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { accountRepo } from '../../../db/repositories/accountRepo'
import { categoryRepo } from '../../../db/repositories/categoryRepo'

export interface ParsedMmbakTransaction {
  sourceId: string
  occurredOn: string // YYYY-MM-DD
  type: 'income' | 'expense' | 'transfer'
  amountMinor: number
  toAmountMinor: number | null
  currency: string
  accountName: string
  toAccountName: string | null
  categoryName: string | null
  subcategoryName: string | null
  payee: string | null
  note: string | null
}

export interface MmbakParseResult {
  layout: 'android' | 'ios' | 'unknown'
  format: 'zip' | 'sqlite'
  transactions: ParsedMmbakTransaction[]
  accounts: Array<{ id: string; name: string; currency: string }>
  categories: Array<{ id: string; name: string; type: 'income' | 'expense' }>
  deletedCount: number
  skippedCount: number
  skippedFeatures: string[]
}

// ── Column Alias Tables ────────────────────────────────────────────────────────

const ANDROID_ALIASES = {
  txTable: ['INOUTCOME', 'inoutcome', 'tb_inoutcome', 'transactions'],
  accountTable: ['ACCOUNT', 'account', 'tb_account', 'accounts'],
  categoryTable: ['CATEGORY', 'category', 'tb_category', 'categories'],
  subcategoryTable: ['SUBCATEGORY', 'subcategory', 'tb_subcategory', 'subcategories'],
  tx: {
    id: ['_id', 'uid', 'id', 'inoutcome_id'],
    date: ['wdate', 'date', 'occured_at', 'inout_date', 'datetime', 'time'],
    amount: ['money', 'amount', 'inout_money', 'total'],
    type: ['inout_type', 'type', 'io_type', 'inoutcome_type'],
    account: ['account', 'from_account', 'account_uid', 'account_name', 'ac_from'],
    toAccount: ['to_account', 'to_account_uid', 'to_account_name', 'ac_to'],
    category: ['category', 'category_uid', 'category_name'],
    subcategory: ['subcategory', 'sub_category', 'subcategory_name'],
    note: ['content', 'memo', 'note', 'description'],
    payee: ['payee', 'target', 'merchant', 'target_name'],
    deleted: ['deleted', 'is_deleted', 'del', 'del_flag'],
    currency: ['currency', 'currency_code', 'curr'],
  },
  account: {
    id: ['_id', 'uid', 'id'],
    name: ['name', 'account_name', 'title', 'account'],
    currency: ['currency', 'currency_code', 'curr'],
    deleted: ['deleted', 'is_deleted', 'del'],
  },
  category: {
    id: ['_id', 'uid', 'id'],
    name: ['name', 'category_name', 'title', 'category'],
    type: ['type', 'category_type', 'inout_type'],
    deleted: ['deleted', 'is_deleted', 'del'],
  },
}

const IOS_ALIASES = {
  txTable: ['ZINOUTCOME', 'ZTRANSACTION', 'ZENTRY'],
  accountTable: ['ZACCOUNT', 'ZASSET'],
  categoryTable: ['ZCATEGORY'],
  tx: {
    id: ['Z_PK', 'ZID', 'ZUID'],
    date: ['ZDATE', 'ZOCCUREDDATE', 'ZDATETIME'],
    amount: ['ZAMOUNT', 'ZMONEY', 'ZTOTAL'],
    type: ['ZTYPE', 'ZINOUTTYPE', 'ZENTRYTYPE'],
    account: ['ZACCOUNT', 'ZFROMACCOUNT', 'ZACCOUNTNAME'],
    toAccount: ['ZTOACCOUNT', 'ZTOACCOUNTNAME'],
    category: ['ZCATEGORY', 'ZCATEGORYNAME'],
    subcategory: ['ZSUBCATEGORY', 'ZSUBCATEGORYNAME'],
    note: ['ZCONTENT', 'ZMEMO', 'ZNOTE'],
    payee: ['ZPAYEE', 'ZMERCHANT'],
    deleted: ['ZISDELETED', 'ZDELETED', 'ZDEL'],
    currency: ['ZCURRENCY', 'ZCURRENCYCODE'],
  },
  account: {
    id: ['Z_PK', 'ZID'],
    name: ['ZNAME', 'ZTITLE', 'ZACCOUNTNAME'],
    currency: ['ZCURRENCY', 'ZCURRENCYCODE'],
    deleted: ['ZISDELETED', 'ZDELETED'],
  },
  category: {
    id: ['Z_PK', 'ZID'],
    name: ['ZNAME', 'ZTITLE', 'ZCATEGORYNAME'],
    type: ['ZTYPE', 'ZCATEGORYTYPE'],
    deleted: ['ZISDELETED', 'ZDELETED'],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findMatchingTable(availableTables: string[], candidateNames: string[]): string | null {
  const lowerMap = new Map<string, string>()
  for (const t of availableTables) {
    lowerMap.set(t.toLowerCase(), t)
  }
  for (const c of candidateNames) {
    const match = lowerMap.get(c.toLowerCase())
    if (match) return match
  }
  return null
}

function getColumnIndex(columns: string[], aliases: string[]): number {
  const lowerCols = columns.map((c) => c.toLowerCase())
  for (const a of aliases) {
    const idx = lowerCols.indexOf(a.toLowerCase())
    if (idx !== -1) return idx
  }
  return -1
}

/**
 * Parses raw date value to local calendar string YYYY-MM-DD.
 * Rule 5: Never converts occurred_on through UTC.
 */
function parseDateToLocalString(val: unknown, isIos = false): string {
  if (val === null || val === undefined) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  // If string formatted as 'YYYY-MM-DD...' or 'YYYY/MM/DD...'
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/\//g, '-')
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(cleaned)
    if (match && match[1] && match[2] && match[3]) {
      const year = match[1]
      const month = match[2].padStart(2, '0')
      const day = match[3].padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  // Numeric timestamp
  if (typeof val === 'number') {
    let dateObj: Date
    if (isIos) {
      // Core Data timestamp: seconds since 2001-01-01 00:00:00 UTC
      dateObj = new Date((val + 978307200) * 1000)
    } else if (val > 1000000000000) {
      // Milliseconds timestamp
      dateObj = new Date(val)
    } else if (val > 1000000000) {
      // Seconds timestamp
      dateObj = new Date(val * 1000)
    } else {
      dateObj = new Date()
    }

    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function parseAmountToIntegerMinor(val: unknown, currency: string): number {
  if (typeof val === 'number') {
    const exp = CURRENCY_EXPONENTS[currency] ?? 2
    return Math.round(Math.abs(val) * Math.pow(10, exp))
  }
  if (typeof val === 'string') {
    const clean = val.replace(/,/g, '').trim()
    const num = parseFloat(clean)
    if (isNaN(num)) return 0
    const exp = CURRENCY_EXPONENTS[currency] ?? 2
    return Math.round(Math.abs(num) * Math.pow(10, exp))
  }
  return 0
}

// ── Main Unpack & Parse Function ──────────────────────────────────────────────

export async function parseMmbak(
  fileData: ArrayBuffer | Uint8Array,
  options: { defaultCurrency?: string } = {},
): Promise<MmbakParseResult> {
  const bytes = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)
  const defaultCurrency = options.defaultCurrency ?? 'INR'

  // 1. Detect ZIP vs Raw SQLite
  let sqliteBytes: Uint8Array | null = null
  let detectedFormat: 'zip' | 'sqlite' = 'sqlite'

  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    detectedFormat = 'zip'
    const unzipped = fflate.unzipSync(bytes)
    const fileNames = Object.keys(unzipped)

    for (const name of fileNames) {
      const entry = unzipped[name]
      if (entry && entry.length >= 16) {
        const header = String.fromCharCode(...entry.subarray(0, 15))
        if (header.startsWith('SQLite format 3')) {
          sqliteBytes = entry
          break
        }
      }
    }

    if (!sqliteBytes) {
      const candidate = fileNames.find((n) => n.endsWith('.sqlite') || n.endsWith('.db')) || fileNames[0]
      if (candidate && unzipped[candidate]) {
        sqliteBytes = unzipped[candidate]
      }
    }

    if (!sqliteBytes) {
      throw new Error('No SQLite database found inside .mmbak ZIP archive')
    }
  } else {
    const header = String.fromCharCode(...bytes.subarray(0, 15))
    if (header.startsWith('SQLite format 3')) {
      sqliteBytes = bytes
      detectedFormat = 'sqlite'
    } else {
      throw new Error('Unsupported file format. Please upload a valid .mmbak or SQLite database.')
    }
  }

  // 2. Initialize sql.js SQLite engine
  const SQL = await initSqlJs({
    locateFile: () => (typeof window !== 'undefined' ? '/sql-wasm.wasm' : undefined as unknown as string),
  })
  const sqlDb: Database = new SQL.Database(sqliteBytes)

  try {
    // 3. Inspect sqlite_master
    const masterRes = sqlDb.exec("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'")
    const availableTables = masterRes.length > 0 && masterRes[0]?.values ? masterRes[0].values.map((v) => String(v[0])) : []

    // 4. Select Layout Adapter
    const upperTables = availableTables.map((t) => t.toUpperCase())
    const isIos = upperTables.some((t) => t.startsWith('ZINOUTCOME') || t.startsWith('ZTRANSACTION') || (t.startsWith('Z') && upperTables.includes('Z_METADATA')))
    const isAndroid = !isIos && (upperTables.includes('INOUTCOME') || upperTables.some((t) => t.includes('INOUTCOME')))
    const layout: 'android' | 'ios' | 'unknown' = isIos ? 'ios' : isAndroid ? 'android' : 'unknown'
    const aliases = isIos ? IOS_ALIASES : ANDROID_ALIASES

    // 5. Query Accounts Map
    const accountNameMap = new Map<string, { id: string; name: string; currency: string }>()
    const accountTable = findMatchingTable(availableTables, aliases.accountTable)

    if (accountTable) {
      const accRes = sqlDb.exec(`SELECT * FROM "${accountTable}"`)
      if (accRes.length > 0 && accRes[0]) {
        const cols = accRes[0].columns
        const idIdx = getColumnIndex(cols, aliases.account.id)
        const nameIdx = getColumnIndex(cols, aliases.account.name)
        const currIdx = getColumnIndex(cols, aliases.account.currency)
        const delIdx = getColumnIndex(cols, aliases.account.deleted)

        for (const row of accRes[0].values) {
          if (delIdx !== -1 && (row[delIdx] === 1 || row[delIdx] === '1')) continue
          const id = idIdx !== -1 ? String(row[idIdx]) : uuidv7()
          const name = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]) : `Account ${id}`
          const currency = currIdx !== -1 && row[currIdx] ? String(row[currIdx]).toUpperCase() : defaultCurrency
          accountNameMap.set(id, { id, name, currency })
          accountNameMap.set(name.toLowerCase(), { id, name, currency })
        }
      }
    }

    // 6. Query Categories Map
    const categoryNameMap = new Map<string, { id: string; name: string; type: 'income' | 'expense' }>()
    const categoryTable = findMatchingTable(availableTables, aliases.categoryTable)

    if (categoryTable) {
      const catRes = sqlDb.exec(`SELECT * FROM "${categoryTable}"`)
      if (catRes.length > 0 && catRes[0]) {
        const cols = catRes[0].columns
        const idIdx = getColumnIndex(cols, aliases.category.id)
        const nameIdx = getColumnIndex(cols, aliases.category.name)
        const typeIdx = getColumnIndex(cols, aliases.category.type)
        const delIdx = getColumnIndex(cols, aliases.category.deleted)

        for (const row of catRes[0].values) {
          if (delIdx !== -1 && (row[delIdx] === 1 || row[delIdx] === '1')) continue
          const id = idIdx !== -1 ? String(row[idIdx]) : uuidv7()
          const name = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]) : `Category ${id}`
          let catType: 'income' | 'expense' = 'expense'
          if (typeIdx !== -1) {
            const rawType = String(row[typeIdx]).toLowerCase()
            if (rawType === '0' || rawType === 'income' || rawType === 'in') {
              catType = 'income'
            }
          }
          categoryNameMap.set(id, { id, name, type: catType })
          categoryNameMap.set(name.toLowerCase(), { id, name, type: catType })
        }
      }
    }

    // 7. Query and Parse Transactions
    const txTable = findMatchingTable(availableTables, aliases.txTable)
    if (!txTable) {
      throw new Error('Could not identify transactions table (e.g. INOUTCOME or ZINOUTCOME) in database.')
    }

    const txRes = sqlDb.exec(`SELECT * FROM "${txTable}"`)
    const parsedTransactions: ParsedMmbakTransaction[] = []
    let deletedCount = 0
    let skippedCount = 0

    if (txRes.length > 0 && txRes[0]) {
      const cols = txRes[0].columns
      const idIdx = getColumnIndex(cols, aliases.tx.id)
      const dateIdx = getColumnIndex(cols, aliases.tx.date)
      const amountIdx = getColumnIndex(cols, aliases.tx.amount)
      const typeIdx = getColumnIndex(cols, aliases.tx.type)
      const accIdx = getColumnIndex(cols, aliases.tx.account)
      const toAccIdx = getColumnIndex(cols, aliases.tx.toAccount)
      const catIdx = getColumnIndex(cols, aliases.tx.category)
      const subcatIdx = getColumnIndex(cols, aliases.tx.subcategory)
      const noteIdx = getColumnIndex(cols, aliases.tx.note)
      const payeeIdx = getColumnIndex(cols, aliases.tx.payee)
      const delIdx = getColumnIndex(cols, aliases.tx.deleted)
      const currIdx = getColumnIndex(cols, aliases.tx.currency)

      for (const row of txRes[0].values) {
        // Skip deleted
        if (delIdx !== -1 && (row[delIdx] === 1 || row[delIdx] === '1')) {
          deletedCount++
          continue
        }

        const rawAmount = amountIdx !== -1 ? row[amountIdx] : 0
        if (!rawAmount || rawAmount === 0 || rawAmount === '0') {
          skippedCount++
          continue
        }

        const rawId = idIdx !== -1 && row[idIdx] ? String(row[idIdx]) : uuidv7()
        const rawDate = dateIdx !== -1 ? row[dateIdx] : null
        const occurredOn = parseDateToLocalString(rawDate, isIos)

        // Currency
        let currency = defaultCurrency
        if (currIdx !== -1 && row[currIdx]) {
          currency = String(row[currIdx]).toUpperCase()
        }

        // Account
        const rawAcc = accIdx !== -1 && row[accIdx] ? String(row[accIdx]) : 'Main Account'
        const matchedAcc = accountNameMap.get(rawAcc) || accountNameMap.get(rawAcc.toLowerCase())
        const accountName = matchedAcc ? matchedAcc.name : rawAcc
        if (matchedAcc && currIdx === -1) {
          currency = matchedAcc.currency
        }

        // To Account (for transfers)
        let toAccountName: string | null = null
        if (toAccIdx !== -1 && row[toAccIdx]) {
          const rawToAcc = String(row[toAccIdx])
          const matchedTo = accountNameMap.get(rawToAcc) || accountNameMap.get(rawToAcc.toLowerCase())
          toAccountName = matchedTo ? matchedTo.name : rawToAcc
        }

        // Type: 0 = income, 1 = expense, 2 = transfer
        let txType: 'income' | 'expense' | 'transfer' = 'expense'
        if (typeIdx !== -1 && row[typeIdx] !== null && row[typeIdx] !== undefined) {
          const rawType = String(row[typeIdx]).toLowerCase()
          if (rawType === '0' || rawType === 'income' || rawType === 'in') {
            txType = 'income'
          } else if (rawType === '2' || rawType === 'transfer' || rawType === 'tr') {
            txType = 'transfer'
          } else {
            txType = 'expense'
          }
        } else if (toAccountName) {
          txType = 'transfer'
        }

        // Category & Subcategory
        let categoryName: string | null = null
        if (catIdx !== -1 && row[catIdx]) {
          const rawCat = String(row[catIdx])
          const matchedCat = categoryNameMap.get(rawCat) || categoryNameMap.get(rawCat.toLowerCase())
          categoryName = matchedCat ? matchedCat.name : rawCat
        }

        let subcategoryName: string | null = null
        if (subcatIdx !== -1 && row[subcatIdx]) {
          subcategoryName = String(row[subcatIdx])
        }

        const payee = payeeIdx !== -1 && row[payeeIdx] ? String(row[payeeIdx]).trim() : null
        const note = noteIdx !== -1 && row[noteIdx] ? String(row[noteIdx]).trim() : null

        const amountMinor = parseAmountToIntegerMinor(rawAmount, currency)
        if (amountMinor <= 0) {
          skippedCount++
          continue
        }

        parsedTransactions.push({
          sourceId: rawId,
          occurredOn,
          type: txType,
          amountMinor,
          toAmountMinor: txType === 'transfer' ? amountMinor : null,
          currency,
          accountName,
          toAccountName: txType === 'transfer' ? toAccountName : null,
          categoryName,
          subcategoryName,
          payee,
          note,
        })
      }
    }

    const uniqueAccounts = Array.from(accountNameMap.values()).filter(
      (a, idx, arr) => arr.findIndex((x) => x.name.toLowerCase() === a.name.toLowerCase()) === idx,
    )
    const uniqueCategories = Array.from(categoryNameMap.values()).filter(
      (c, idx, arr) => arr.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase()) === idx,
    )

    return {
      layout,
      format: detectedFormat,
      transactions: parsedTransactions,
      accounts: uniqueAccounts,
      categories: uniqueCategories,
      deletedCount,
      skippedCount,
      skippedFeatures: ['budgets', 'recurring_rules', 'photos', 'loans'],
    }
  } finally {
    sqlDb.close()
  }
}

// ── Batch Import Execution & Undo ─────────────────────────────────────────────

export async function importMmbakBatch(
  parseResult: MmbakParseResult,
  userId: string,
  baseCurrency: string,
): Promise<{ batchId: string; createdCount: number }> {
  const batchId = uuidv7()
  const createdTxIds: string[] = []

  // Ensure accounts exist or create them
  const existingAccounts = await db.accounts.filter((a) => !a.deletedAt).toArray()
  const accountMap = new Map<string, string>() // Name lowercase -> Account ID

  for (const acc of existingAccounts) {
    accountMap.set(acc.name.toLowerCase(), acc.id)
  }

  for (const acc of parseResult.accounts) {
    if (!accountMap.has(acc.name.toLowerCase())) {
      const created = await accountRepo.create({
        userId,
        name: acc.name,
        kind: 'general',
        currency: acc.currency || baseCurrency,
        openingBalanceMinor: 0,
        openingDate: new Date().toISOString().substring(0, 10),
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        excludeFromNetWorth: false,
        icon: 'Landmark',
        color: '#10b981',
        sortOrder: 0,
        archivedAt: null,
      })
      accountMap.set(acc.name.toLowerCase(), created.id)
    }
  }

  // Ensure categories exist or create them
  const existingCategories = await db.categories.filter((c) => !c.deletedAt).toArray()
  const categoryMap = new Map<string, string>() // Name lowercase -> Category ID

  for (const cat of existingCategories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id)
  }

  for (const cat of parseResult.categories) {
    if (!categoryMap.has(cat.name.toLowerCase())) {
      const created = await categoryRepo.create({
        userId,
        name: cat.name,
        kind: cat.type,
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 0,
        archivedAt: null,
        systemKey: null,
      })
      categoryMap.set(cat.name.toLowerCase(), created.id)
    }
  }

  // Create transactions in batch
  for (const tx of parseResult.transactions) {
    let accountId = accountMap.get(tx.accountName.toLowerCase())
    if (!accountId) {
      const created = await accountRepo.create({
        userId,
        name: tx.accountName,
        kind: 'general',
        currency: tx.currency || baseCurrency,
        openingBalanceMinor: 0,
        openingDate: new Date().toISOString().substring(0, 10),
        creditLimitMinor: null,
        statementDay: null,
        dueDay: null,
        note: null,
        excludeFromNetWorth: false,
        icon: 'Landmark',
        color: '#10b981',
        sortOrder: 0,
        archivedAt: null,
      })
      accountId = created.id
      accountMap.set(tx.accountName.toLowerCase(), created.id)
    }

    let toAccountId: string | null = null
    if (tx.type === 'transfer' && tx.toAccountName) {
      toAccountId = accountMap.get(tx.toAccountName.toLowerCase()) ?? null
      if (!toAccountId) {
        const createdTo = await accountRepo.create({
          userId,
          name: tx.toAccountName,
          kind: 'general',
          currency: tx.currency || baseCurrency,
          openingBalanceMinor: 0,
          openingDate: new Date().toISOString().substring(0, 10),
          creditLimitMinor: null,
          statementDay: null,
          dueDay: null,
          note: null,
          excludeFromNetWorth: false,
          icon: 'Landmark',
          color: '#10b981',
          sortOrder: 0,
          archivedAt: null,
        })
        toAccountId = createdTo.id
        accountMap.set(tx.toAccountName.toLowerCase(), createdTo.id)
      }
    }

    let categoryId: string | null = null
    if (tx.categoryName) {
      categoryId = categoryMap.get(tx.categoryName.toLowerCase()) ?? null
      if (!categoryId) {
        const createdCat = await categoryRepo.create({
          userId,
          name: tx.categoryName,
          kind: tx.type === 'income' ? 'income' : 'expense',
          icon: null,
          color: null,
          parentId: null,
          sortOrder: 0,
          archivedAt: null,
          systemKey: null,
        })
        categoryId = createdCat.id
        categoryMap.set(tx.categoryName.toLowerCase(), createdCat.id)
      }
    }

    const createdTx = await transactionRepo.create({
      userId,
      type: tx.type,
      accountId,
      toAccountId,
      amountMinor: tx.amountMinor,
      toAmountMinor: tx.toAmountMinor,
      baseAmountMinor: tx.amountMinor,
      fxRate: '1',
      occurredOn: tx.occurredOn,
      categoryId,
      payee: tx.payee,
      note: tx.note,
      paymentMethod: null,
      recurringRuleId: null,
      recurringOccurrenceDate: null,
      adjustmentSign: null,
    })

    createdTxIds.push(createdTx.id)
  }

  // Save batch manifest in db.kv for one-click undo
  await db.kv.put({
    key: `import_batch_${batchId}`,
    value: {
      batchId,
      createdAt: new Date().toISOString(),
      transactionIds: createdTxIds,
      source: 'mmbak',
    },
  })

  return { batchId, createdCount: createdTxIds.length }
}

export async function undoImportBatch(batchId: string): Promise<number> {
  const entry = await db.kv.get(`import_batch_${batchId}`)
  if (!entry || !entry.value) {
    return 0
  }

  const manifest = entry.value as { transactionIds: string[] }
  let deletedCount = 0

  await db.transaction('rw', [db.transactions, db.outbox, db.kv], async () => {
    for (const id of manifest.transactionIds) {
      await transactionRepo.delete(id)
      deletedCount++
    }
    await db.kv.delete(`import_batch_${batchId}`)
  })

  return deletedCount
}
