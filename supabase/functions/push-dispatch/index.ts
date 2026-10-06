import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Reminder {
  userId: string
  kind: 'bill_reminder' | 'loan_reminder'
  title: string
  body: string
  url: string
  dedupeKey: string
}

const DAY_MS = 86_400_000

// ── Date helpers (calendar dates as YYYY-MM-DD, UTC arithmetic used only as a day counter) ──
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const parts = (date: string) => date.split('-').map(Number) as [number, number, number]

interface RuleRow {
  id: string
  user_id: string
  title: string
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  by_weekday: number[] | null
  by_month_day: number | null
  start_date: string
  end_date: string | null
  max_count: number | null
  amount_minor: number
  remind_days_before: number
}

/** Next occurrence of `step(current)`; mirrors the client's re-anchored recurrence rules. */
function nextOccurrence(rule: RuleRow, current: string): string {
  const [y, m, d] = parts(current)
  switch (rule.freq) {
    case 'daily':
      return addDays(current, rule.interval)
    case 'weekly': {
      if (rule.by_weekday && rule.by_weekday.length > 0) {
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
        const sorted = [...rule.by_weekday].sort((a, b) => a - b)
        const later = sorted.find((x) => x > wd)
        if (later !== undefined) return addDays(current, later - wd)
        return addDays(current, 7 - wd + sorted[0]! + (rule.interval - 1) * 7)
      }
      return addDays(current, rule.interval * 7)
    }
    case 'monthly': {
      let nm = m + rule.interval
      let ny = y
      while (nm > 12) {
        nm -= 12
        ny++
      }
      const anchor = rule.by_month_day ?? parts(rule.start_date)[2]
      const last = dim(ny, nm)
      return fmt(ny, nm, anchor === -1 ? last : Math.min(anchor, last))
    }
    case 'yearly': {
      const [, sm, sd] = parts(rule.start_date)
      const ny = y + rule.interval
      return fmt(ny, sm, Math.min(sd, dim(ny, sm)))
    }
  }
}

/** First occurrence on or after `from` (or null when the rule has ended). */
function nextDueOnOrAfter(rule: RuleRow, from: string): string | null {
  let current = rule.start_date
  let count = 0
  for (let guard = 0; guard < 5000; guard++) {
    if (rule.max_count !== null && count >= rule.max_count) return null
    if (rule.end_date && current > rule.end_date) return null
    if (current >= from) return current
    const next = nextOccurrence(rule, current)
    if (next === current) return null
    current = next
    count++
  }
  return null
}

function isAuthorized(req: Request, serviceKey: string): boolean {
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (bearer && bearer === serviceKey) return true
  const cronSecret = Deno.env.get('CRON_SECRET')
  return !!cronSecret && req.headers.get('x-cron-secret') === cronSecret
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // This job runs with the service role for every user: only the scheduler may call it.
  if (!isAuthorized(req, supabaseServiceKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const today = new Date().toISOString().split('T')[0]!
    const reminders: Reminder[] = []

    // 1. Upcoming recurring bills (active rules only)
    const { data: rules, error: rulesError } = await supabase
      .from('recurring_rules')
      .select(
        'id, user_id, title, freq, interval, by_weekday, by_month_day, start_date, end_date, max_count, amount_minor, remind_days_before',
      )
      .is('deleted_at', null)
      .is('paused_at', null)

    if (rulesError) throw new Error(`recurring_rules query failed: ${rulesError.message}`)

    for (const rule of (rules ?? []) as RuleRow[]) {
      const due = nextDueOnOrAfter(rule, today)
      if (!due) continue
      const remindFrom = addDays(due, -(rule.remind_days_before ?? 1))
      if (today >= remindFrom) {
        reminders.push({
          userId: rule.user_id,
          kind: 'bill_reminder',
          title: `Bill reminder: ${rule.title}`.slice(0, 120),
          body: `Due on ${due}. Don't forget to pay or record it.`,
          url: '/bills',
          dedupeKey: `bill-${rule.id}-${due}`,
        })
      }
    }

    // 2. Loan EMIs due within the next 3 days
    const { data: loans, error: loanError } = await supabase
      .from('loan_terms')
      .select('id, user_id, account_id, payment_day, start_date, direction')
      .is('deleted_at', null)
      .eq('direction', 'borrowed')

    if (loanError) throw new Error(`loan_terms query failed: ${loanError.message}`)

    const accountIds = [...new Set((loans ?? []).map((l) => l.account_id as string))]
    const accountNames = new Map<string, string>()
    if (accountIds.length > 0) {
      const { data: accts } = await supabase.from('accounts').select('id, name').in('id', accountIds)
      for (const a of accts ?? []) accountNames.set(a.id as string, a.name as string)
    }

    const [ty, tm] = parts(today)
    for (const loan of loans ?? []) {
      const payDay = (loan.payment_day as number | null) ?? parts(loan.start_date as string)[2]
      // Candidate due dates: this month and next month (handles month boundaries).
      const candidates = [
        fmt(ty, tm, Math.min(payDay, dim(ty, tm))),
        tm === 12 ? fmt(ty + 1, 1, Math.min(payDay, dim(ty + 1, 1))) : fmt(ty, tm + 1, Math.min(payDay, dim(ty, tm + 1))),
      ]
      const due = candidates.find((c) => c >= today && c <= addDays(today, 3))
      if (!due) continue
      const name = accountNames.get(loan.account_id as string) ?? 'Loan'
      reminders.push({
        userId: loan.user_id as string,
        kind: 'loan_reminder',
        title: `Loan EMI reminder: ${name}`.slice(0, 120),
        body: `Your loan payment is due on ${due}.`,
        url: '/loans',
        dedupeKey: `loan-${loan.id}-${due}`,
      })
    }

    // 3. Insert in-app notifications (once per dedupe key, never again after the user dismissed it)
    let createdCount = 0
    const nowIso = new Date().toISOString()
    for (const item of reminders) {
      const { data: existing, error: existingError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', item.userId)
        .eq('dedupe_key', item.dedupeKey)
        .limit(1)
        .maybeSingle()
      if (existingError) {
        console.warn('notification lookup failed:', existingError.message)
        continue
      }
      if (existing) continue

      const { error: insertError } = await supabase.from('notifications').insert({
        id: crypto.randomUUID(),
        user_id: item.userId,
        kind: item.kind,
        title: item.title,
        body: item.body,
        payload: { url: item.url },
        dedupe_key: item.dedupeKey,
        created_at: nowIso,
        updated_at: nowIso,
      })

      if (insertError) {
        console.warn('notification insert failed:', insertError.message)
      } else {
        createdCount++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatchedCandidates: reminders.length,
        createdNotifications: createdCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
