import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import initSqlJs from 'sql.js'
import * as fflate from 'fflate'
import { db } from '../../../db/db'
import { parseMmbak, importMmbakBatch, undoImportBatch } from '../services/mmbakParser'

describe('Money Manager (.mmbak / .sqlite) Importer (F-081)', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>

  beforeEach(async () => {
    SQL = await initSqlJs()
    await db.transaction('rw', [db.accounts, db.categories, db.transactions, db.outbox, db.kv], async () => {
      await db.accounts.clear()
      await db.categories.clear()
      await db.transactions.clear()
      await db.outbox.clear()
      await db.kv.clear()
    })
  })

  it('parses an Android-style SQLite database inside a ZIP (.mmbak)', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE ACCOUNT (_id INTEGER PRIMARY KEY, name TEXT, currency TEXT, deleted INTEGER);
      CREATE TABLE CATEGORY (_id INTEGER PRIMARY KEY, name TEXT, type INTEGER, deleted INTEGER);
      CREATE TABLE INOUTCOME (
        _id INTEGER PRIMARY KEY,
        wdate TEXT,
        money REAL,
        inout_type INTEGER,
        account TEXT,
        to_account TEXT,
        category TEXT,
        subcategory TEXT,
        payee TEXT,
        content TEXT,
        deleted INTEGER,
        currency TEXT
      );

      INSERT INTO ACCOUNT VALUES (1, 'HDFC Bank', 'INR', 0);
      INSERT INTO CATEGORY VALUES (10, 'Groceries', 1, 0);
      INSERT INTO CATEGORY VALUES (20, 'Salary', 0, 0);

      INSERT INTO INOUTCOME VALUES (101, '2026-03-15 10:30:00', 450.50, 1, 'HDFC Bank', NULL, 'Groceries', 'Vegetables', 'Local Vendor', 'Weekly veggies', 0, 'INR');
      INSERT INTO INOUTCOME VALUES (102, '2026-03-01 09:00:00', 50000.00, 0, 'HDFC Bank', NULL, 'Salary', NULL, 'Employer Corp', 'March Salary', 0, 'INR');
    `)

    const sqliteBytes = sqliteDb.export()
    sqliteDb.close()

    // Wrap in ZIP (.mmbak)
    const zipped = fflate.zipSync({
      'money.sqlite': sqliteBytes,
    })

    const result = await parseMmbak(zipped, { defaultCurrency: 'INR' })

    expect(result.format).toBe('zip')
    expect(result.layout).toBe('android')
    expect(result.transactions).toHaveLength(2)

    const expTx = result.transactions.find((t) => t.type === 'expense')
    expect(expTx).toBeDefined()
    expect(expTx?.amountMinor).toBe(45050) // 450.50 INR -> 45050 paise
    expect(expTx?.occurredOn).toBe('2026-03-15')
    expect(expTx?.accountName).toBe('HDFC Bank')
    expect(expTx?.categoryName).toBe('Groceries')
    expect(expTx?.subcategoryName).toBe('Vegetables')

    const incTx = result.transactions.find((t) => t.type === 'income')
    expect(incTx).toBeDefined()
    expect(incTx?.amountMinor).toBe(5000000) // 50000.00 INR -> 5000000 paise
    expect(incTx?.occurredOn).toBe('2026-03-01')
  })

  it('parses an iOS Core Data style database (.sqlite)', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE Z_METADATA (Z_VERSION INTEGER);
      CREATE TABLE ZACCOUNT (Z_PK INTEGER PRIMARY KEY, ZNAME TEXT, ZCURRENCY TEXT, ZDELETED INTEGER);
      CREATE TABLE ZCATEGORY (Z_PK INTEGER PRIMARY KEY, ZNAME TEXT, ZTYPE INTEGER, ZDELETED INTEGER);
      CREATE TABLE ZINOUTCOME (
        Z_PK INTEGER PRIMARY KEY,
        ZDATE REAL,
        ZAMOUNT REAL,
        ZTYPE INTEGER,
        ZACCOUNT INTEGER,
        ZTOACCOUNT INTEGER,
        ZCATEGORY INTEGER,
        ZSUBCATEGORY TEXT,
        ZPAYEE TEXT,
        ZCONTENT TEXT,
        ZISDELETED INTEGER,
        ZCURRENCY TEXT
      );

      INSERT INTO ZACCOUNT VALUES (1, 'Apple Card', 'USD', 0);
      INSERT INTO ZCATEGORY VALUES (5, 'Electronics', 1, 0);

      -- Core Data timestamp for 2026-03-10: (approx 794880000 seconds since 2001-01-01)
      INSERT INTO ZINOUTCOME VALUES (501, 794880000, 199.99, 1, 1, NULL, 5, 'Gadgets', 'Best Buy', 'Wireless Mouse', 0, 'USD');
    `)

    const sqliteBytes = sqliteDb.export()
    sqliteDb.close()

    const result = await parseMmbak(sqliteBytes, { defaultCurrency: 'USD' })

    expect(result.format).toBe('sqlite')
    expect(result.layout).toBe('ios')
    expect(result.transactions).toHaveLength(1)

    const tx = result.transactions[0]
    expect(tx?.amountMinor).toBe(19999) // 199.99 USD -> 19999 cents
    expect(tx?.currency).toBe('USD')
    expect(tx?.accountName).toBe('Apple Card')
    expect(tx?.categoryName).toBe('Electronics')
  })

  it('skips deleted rows properly', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE INOUTCOME (
        _id INTEGER PRIMARY KEY,
        wdate TEXT,
        money REAL,
        inout_type INTEGER,
        account TEXT,
        deleted INTEGER
      );

      INSERT INTO INOUTCOME VALUES (1, '2026-03-10', 100.0, 1, 'Cash', 0);
      INSERT INTO INOUTCOME VALUES (2, '2026-03-11', 200.0, 1, 'Cash', 1); -- Deleted
      INSERT INTO INOUTCOME VALUES (3, '2026-03-12', 300.0, 1, 'Cash', 0);
      INSERT INTO INOUTCOME VALUES (4, '2026-03-13', 400.0, 1, 'Cash', 1); -- Deleted
    `)

    const sqliteBytes = sqliteDb.export()
    sqliteDb.close()

    const result = await parseMmbak(sqliteBytes)
    expect(result.transactions).toHaveLength(2)
    expect(result.deletedCount).toBe(2)
    expect(result.transactions.map((t) => t.amountMinor)).toEqual([10000, 30000])
  })

  it('correctly maps transfers and multi-currency amounts', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE ACCOUNT (_id INTEGER PRIMARY KEY, name TEXT, currency TEXT);
      CREATE TABLE INOUTCOME (
        _id INTEGER PRIMARY KEY,
        wdate TEXT,
        money REAL,
        inout_type INTEGER,
        account TEXT,
        to_account TEXT,
        currency TEXT
      );

      INSERT INTO ACCOUNT VALUES (1, 'Savings', 'INR');
      INSERT INTO ACCOUNT VALUES (2, 'Wallet', 'INR');
      INSERT INTO ACCOUNT VALUES (3, 'JPY Cash', 'JPY');

      -- Transfer from Savings to Wallet
      INSERT INTO INOUTCOME VALUES (1, '2026-03-01', 2000.0, 2, 'Savings', 'Wallet', 'INR');
      -- Expense in JPY (0 decimals)
      INSERT INTO INOUTCOME VALUES (2, '2026-03-02', 1500.0, 1, 'JPY Cash', NULL, 'JPY');
    `)

    const sqliteBytes = sqliteDb.export()
    sqliteDb.close()

    const result = await parseMmbak(sqliteBytes)
    expect(result.transactions).toHaveLength(2)

    const transfer = result.transactions.find((t) => t.type === 'transfer')
    expect(transfer).toBeDefined()
    expect(transfer?.accountName).toBe('Savings')
    expect(transfer?.toAccountName).toBe('Wallet')
    expect(transfer?.amountMinor).toBe(200000)

    const jpyTx = result.transactions.find((t) => t.currency === 'JPY')
    expect(jpyTx).toBeDefined()
    expect(jpyTx?.amountMinor).toBe(1500) // JPY has exponent 0: 1500 * 10^0 = 1500 minor units
  })

  it('executes batch import and one-click undo cleanly', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE INOUTCOME (_id INTEGER PRIMARY KEY, wdate TEXT, money REAL, inout_type INTEGER, account TEXT);
      INSERT INTO INOUTCOME VALUES (1, '2026-03-01', 100.0, 1, 'Checking');
      INSERT INTO INOUTCOME VALUES (2, '2026-03-02', 200.0, 1, 'Checking');
      INSERT INTO INOUTCOME VALUES (3, '2026-03-03', 300.0, 0, 'Checking');
    `)
    const bytes = sqliteDb.export()
    sqliteDb.close()

    const parsed = await parseMmbak(bytes, { defaultCurrency: 'INR' })
    const { batchId, createdCount } = await importMmbakBatch(parsed, 'user-123', 'INR')

    expect(createdCount).toBe(3)
    const txsInDb = await db.transactions.filter((tx) => !tx.deletedAt).toArray()
    expect(txsInDb).toHaveLength(3)

    // Undo batch
    const undoneCount = await undoImportBatch(batchId)
    expect(undoneCount).toBe(3)

    const txsAfterUndo = await db.transactions.filter((tx) => !tx.deletedAt).toArray()
    expect(txsAfterUndo).toHaveLength(0)
  })

  it('imports 5,000 rows within 5 seconds performance requirement', async () => {
    const sqliteDb = new SQL.Database()
    sqliteDb.run(`
      CREATE TABLE INOUTCOME (
        _id INTEGER PRIMARY KEY,
        wdate TEXT,
        money REAL,
        inout_type INTEGER,
        account TEXT,
        category TEXT,
        payee TEXT,
        deleted INTEGER
      );
    `)

    // Insert 5,000 rows
    sqliteDb.run('BEGIN TRANSACTION;')
    for (let i = 1; i <= 5000; i++) {
      sqliteDb.run(
        `INSERT INTO INOUTCOME VALUES (${i}, '2026-01-15', 50.0, 1, 'Bank Account', 'Food', 'Merchant ${i}', 0);`,
      )
    }
    sqliteDb.run('COMMIT;')

    const bytes = sqliteDb.export()
    sqliteDb.close()

    const startTime = performance.now()
    const parsed = await parseMmbak(bytes, { defaultCurrency: 'INR' })
    const parseDurationMs = performance.now() - startTime

    expect(parsed.transactions).toHaveLength(5000)
    expect(parseDurationMs).toBeLessThan(5000) // Within 5 seconds!
  })
})
