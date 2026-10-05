import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../db/db'
import { transactionRepo } from '../../../db/repositories/transactionRepo'
import { useAuthStore } from '../../auth/stores/authStore'
import { useSettingsStore } from '../../settings/stores/settingsStore'
import { parseAmountToMinor, formatMoney } from '../../../lib/money'
import { Page, PageHeader, Card, CardTitle, Button, Select, Badge } from '../../../ui'
import { Upload, CheckCircle2, RotateCcw, FileText, Database as DbIcon, AlertTriangle } from 'lucide-react'
import { parseMmbak, importMmbakBatch, undoImportBatch, type MmbakParseResult } from '../services/mmbakParser'

export default function ImportScreen() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const { baseCurrency, locale } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<'csv' | 'mmbak'>('csv')

  // CSV states
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [dateCol, setDateCol] = useState('0')
  const [amountCol, setAmountCol] = useState('1')
  const [typeCol, setTypeCol] = useState('2')
  const [payeeCol, setPayeeCol] = useState('3')
  const [noteCol, setNoteCol] = useState('4')
  const [targetAccountId, setTargetAccountId] = useState('')

  // MMBAK states
  const [mmbakResult, setMmbakResult] = useState<MmbakParseResult | null>(null)
  const [isParsingMmbak, setIsParsingMmbak] = useState(false)
  const [mmbakError, setMmbakError] = useState<string | null>(null)

  // Success / Undo states
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState<number>(0)
  const [isSuccess, setIsSuccess] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [])
  const existingTransactions = useLiveQuery(() => db.transactions.filter((tx) => !tx.deletedAt).toArray(), [])

  // Handle generic file upload (auto-detect format)
  const handleGenericFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.mmbak') || lowerName.endsWith('.sqlite') || lowerName.endsWith('.db')) {
      setActiveTab('mmbak')
      await handleMmbakUpload(file)
    } else {
      setActiveTab('csv')
      handleCsvUpload(file)
    }
  }

  // Handle CSV file upload
  const handleCsvUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)

      if (lines.length > 0) {
        const headerCols = lines[0]!.split(',').map((h) => h.replace(/^["']|["']$/g, '').trim())
        setHeaders(headerCols)

        const dataRows = lines.slice(1).map((l) =>
          l.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim()),
        )
        setRows(dataRows)
      }
    }
    reader.readAsText(file)
  }

  // Handle Money Manager upload (.mmbak / .sqlite)
  const handleMmbakUpload = async (file: File) => {
    setIsParsingMmbak(true)
    setMmbakError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await parseMmbak(arrayBuffer, { defaultCurrency: baseCurrency })
      setMmbakResult(result)
    } catch (err) {
      setMmbakError(err instanceof Error ? err.message : 'Failed to parse Money Manager backup file')
      setMmbakResult(null)
    } finally {
      setIsParsingMmbak(false)
    }
  }

  // Execute CSV Import
  const handleCsvImport = async () => {
    if (!user || !targetAccountId || rows.length === 0) return

    const batchId = crypto.randomUUID()
    const createdIds: string[] = []
    const dIdx = parseInt(dateCol, 10)
    const aIdx = parseInt(amountCol, 10)
    const tIdx = parseInt(typeCol, 10)
    const pIdx = parseInt(payeeCol, 10)
    const nIdx = parseInt(noteCol, 10)

    for (const row of rows) {
      const dateVal = row[dIdx] || new Date().toISOString().substring(0, 10)
      const amountVal = row[aIdx] || '0'
      const typeVal = row[tIdx]?.toLowerCase() === 'income' ? 'income' : 'expense'
      const payeeVal = row[pIdx] || 'Imported Transaction'
      const noteVal = row[nIdx] || ''

      let amountMinor = 0
      try {
        amountMinor = parseAmountToMinor(amountVal, baseCurrency)
      } catch {
        continue
      }

      if (amountMinor <= 0) continue

      const tx = await transactionRepo.create({
        userId: user.id,
        type: typeVal,
        accountId: targetAccountId,
        toAccountId: null,
        amountMinor,
        toAmountMinor: null,
        baseAmountMinor: amountMinor,
        fxRate: '1',
        occurredOn: dateVal,
        categoryId: null,
        payee: payeeVal || null,
        note: noteVal ? `${noteVal} (batch:${batchId})` : `batch:${batchId}`,
        paymentMethod: null,
        recurringRuleId: null,
        recurringOccurrenceDate: null,
        adjustmentSign: null,
      })

      createdIds.push(tx.id)
    }

    await db.kv.put({
      key: `import_batch_${batchId}`,
      value: {
        batchId,
        createdAt: new Date().toISOString(),
        transactionIds: createdIds,
        source: 'csv',
      },
    })

    setCurrentBatchId(batchId)
    setImportedCount(createdIds.length)
    setIsSuccess(true)
  }

  // Execute Money Manager Import
  const handleMmbakImport = async () => {
    if (!user || !mmbakResult) return

    const res = await importMmbakBatch(mmbakResult, user.id, baseCurrency)
    setCurrentBatchId(res.batchId)
    setImportedCount(res.createdCount)
    setIsSuccess(true)
  }

  // Execute Undo
  const handleUndo = async () => {
    if (!currentBatchId) return
    await undoImportBatch(currentBatchId)
    setIsSuccess(false)
    setCurrentBatchId(null)
    setImportedCount(0)
    setRows([])
    setHeaders([])
    setMmbakResult(null)
  }

  return (
    <Page width="default" className="space-y-6">
      <PageHeader
        title={t('import.title', 'Data Import')}
        subtitle="Import statement data from CSV files or backups from Money Manager (.mmbak / .sqlite)"
      />

      {isSuccess ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-xl font-bold text-text">Import Complete!</h2>
          <p className="text-sm text-text-muted">
            Successfully imported <span className="font-bold text-text">{importedCount}</span> transactions into your accounts.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              leftIcon={<RotateCcw size={16} />}
              onClick={handleUndo}
            >
              Undo Import (Delete Imported Batch)
            </Button>
            <Button variant="primary" onClick={() => setIsSuccess(false)}>
              Import Another File
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Format Selection Tabs */}
          <div className="flex gap-2 border-b border-border pb-2">
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                activeTab === 'csv' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text bg-surface'
              }`}
              onClick={() => setActiveTab('csv')}
            >
              <FileText size={16} />
              CSV Spreadsheet
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                activeTab === 'mmbak' ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:text-text bg-surface'
              }`}
              onClick={() => setActiveTab('mmbak')}
            >
              <DbIcon size={16} />
              Money Manager (.mmbak / .sqlite)
            </button>
          </div>

          {/* Upload Box */}
          <Card className="p-8 border-dashed border-2 border-border text-center">
            <input
              type="file"
              accept=".csv,text/csv,.mmbak,.sqlite,.db"
              id="fileUploadInput"
              className="hidden"
              onChange={handleGenericFileUpload}
            />
            <label htmlFor="fileUploadInput" className="cursor-pointer block space-y-2">
              <Upload size={36} className="mx-auto text-primary" />
              <div className="font-semibold text-text text-sm">
                Click to choose a file ({activeTab === 'csv' ? 'CSV Statement' : 'Money Manager .mmbak / .sqlite'})
              </div>
              <p className="text-xs text-text-muted">
                {activeTab === 'csv'
                  ? 'Supports standard bank, card, and personal finance CSV exports'
                  : '100% offline client-side parsing — files never leave your device'}
              </p>
            </label>
          </Card>

          {isParsingMmbak && (
            <Card className="p-6 text-center text-text-muted text-sm">
              Parsing Money Manager backup database...
            </Card>
          )}

          {mmbakError && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
              <AlertTriangle size={18} />
              {mmbakError}
            </div>
          )}

          {/* Money Manager Preview */}
          {activeTab === 'mmbak' && mmbakResult && (
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Money Manager Backup Preview</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="neutral">
                    {mmbakResult.layout === 'android' ? 'Android Layout' : mmbakResult.layout === 'ios' ? 'iOS Core Data' : 'Generic SQLite'}
                  </Badge>
                  <Badge variant="primary">{mmbakResult.transactions.length} Transactions</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-surface-overlay rounded-lg">
                  <span className="text-text-muted block">Accounts Found</span>
                  <span className="text-base font-bold text-text">{mmbakResult.accounts.length}</span>
                </div>
                <div className="p-3 bg-surface-overlay rounded-lg">
                  <span className="text-text-muted block">Categories Found</span>
                  <span className="text-base font-bold text-text">{mmbakResult.categories.length}</span>
                </div>
                <div className="p-3 bg-surface-overlay rounded-lg">
                  <span className="text-text-muted block">Deleted Rows Skipped</span>
                  <span className="text-base font-bold text-text">{mmbakResult.deletedCount}</span>
                </div>
                <div className="p-3 bg-surface-overlay rounded-lg">
                  <span className="text-text-muted block">Skipped Features</span>
                  <span className="text-xs font-semibold text-text truncate">
                    {mmbakResult.skippedFeatures.join(', ')}
                  </span>
                </div>
              </div>

              {/* Transactions Preview Table */}
              <div className="pt-2 border-t border-border">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-2">
                  Transaction Preview (First {Math.min(5, mmbakResult.transactions.length)} rows)
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-overlay text-text-muted text-[10px]">
                      <tr>
                        <th className="p-2 border border-border/50">Date</th>
                        <th className="p-2 border border-border/50">Type</th>
                        <th className="p-2 border border-border/50">Account</th>
                        <th className="p-2 border border-border/50">Category</th>
                        <th className="p-2 border border-border/50">Amount</th>
                        <th className="p-2 border border-border/50">Payee / Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mmbakResult.transactions.slice(0, 5).map((t, idx) => (
                        <tr key={idx}>
                          <td className="p-2 border border-border/50 text-text">{t.occurredOn}</td>
                          <td className="p-2 border border-border/50">
                            <span className={`capitalize font-semibold ${t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-danger' : 'text-primary'}`}>
                              {t.type}
                            </span>
                          </td>
                          <td className="p-2 border border-border/50 text-text">
                            {t.type === 'transfer' ? `${t.accountName} → ${t.toAccountName}` : t.accountName}
                          </td>
                          <td className="p-2 border border-border/50 text-text">
                            {t.categoryName || 'Uncategorized'}
                          </td>
                          <td className="p-2 border border-border/50 font-mono text-text">
                            {formatMoney(t.amountMinor, t.currency, locale)}
                          </td>
                          <td className="p-2 border border-border/50 text-text truncate max-w-[150px]">
                            {t.payee || t.note || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  variant="primary"
                  onClick={handleMmbakImport}
                >
                  Import {mmbakResult.transactions.length} Records from Backup
                </Button>
              </div>
            </Card>
          )}

          {/* CSV Column Mapping Form */}
          {activeTab === 'csv' && headers.length > 0 && (
            <Card className="p-5 space-y-4">
              <CardTitle className="text-base">Map CSV Columns</CardTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Target Account"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  required
                  options={[
                    { value: '', label: '-- Select Destination Account --' },
                    ...(accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []),
                  ]}
                />
                <Select
                  label="Date Column"
                  value={dateCol}
                  onChange={(e) => setDateCol(e.target.value)}
                  options={headers.map((h, i) => ({ value: i.toString(), label: `${h} (Col ${i + 1})` }))}
                />
                <Select
                  label="Amount Column"
                  value={amountCol}
                  onChange={(e) => setAmountCol(e.target.value)}
                  options={headers.map((h, i) => ({ value: i.toString(), label: `${h} (Col ${i + 1})` }))}
                />
                <Select
                  label="Type Column (Optional)"
                  value={typeCol}
                  onChange={(e) => setTypeCol(e.target.value)}
                  options={headers.map((h, i) => ({ value: i.toString(), label: `${h} (Col ${i + 1})` }))}
                />
                <Select
                  label="Payee Column"
                  value={payeeCol}
                  onChange={(e) => setPayeeCol(e.target.value)}
                  options={headers.map((h, i) => ({ value: i.toString(), label: `${h} (Col ${i + 1})` }))}
                />
                <Select
                  label="Note Column (Optional)"
                  value={noteCol}
                  onChange={(e) => setNoteCol(e.target.value)}
                  options={headers.map((h, i) => ({ value: i.toString(), label: `${h} (Col ${i + 1})` }))}
                />
              </div>

              {/* Preview table (first 5 rows) */}
              <div className="pt-4 border-t border-border">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-2">
                  Preview (First {Math.min(5, rows.length)} of {rows.length} rows)
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-overlay text-text-muted text-[10px]">
                      <tr>
                        {headers.map((h, idx) => (
                          <th key={idx} className="p-2 border border-border/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, rIdx) => (
                        <tr key={rIdx}>
                          {r.map((c, cIdx) => (
                            <td key={cIdx} className="p-2 border border-border/50 text-text">{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  variant="primary"
                  disabled={!targetAccountId || rows.length === 0}
                  onClick={handleCsvImport}
                >
                  Import {rows.length} Records
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </Page>
  )
}
