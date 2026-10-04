/**
 * supabase/functions/fx-refresh/index.ts
 *
 * Daily Edge Function to fetch FX rates against USD and upsert into `fx_rates`.
 * Triggered by pg_cron daily at 00:05 UTC or manually by administrators.
 *
 * @see Sanchay_spec.md section 11.2, ADR 0002
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

interface FxProvider {
  name: string
  fetchRates(base: string): Promise<{ date: string; rates: Record<string, number> }>
}

class OpenErProvider implements FxProvider {
  name = 'open.er-api.com'

  async fetchRates(base = 'USD'): Promise<{ date: string; rates: Record<string, number> }> {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
    if (!res.ok) throw new Error(`OpenER API failed with status ${res.status}`)

    const data = await res.json()
    if (data.result !== 'success' || !data.rates) {
      throw new Error(`OpenER returned unsuccessful response: ${JSON.stringify(data)}`)
    }

    const date = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString().substring(0, 10)
      : new Date().toISOString().substring(0, 10)

    return { date, rates: data.rates }
  }
}

class FrankfurterProvider implements FxProvider {
  name = 'frankfurter.app'

  async fetchRates(base = 'USD'): Promise<{ date: string; rates: Record<string, number> }> {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`)
    if (!res.ok) throw new Error(`Frankfurter API failed with status ${res.status}`)

    const data = await res.json()
    const rates: Record<string, number> = {
      ...(data.rates || {}),
      [base]: 1.0,
    }

    return { date: data.date || new Date().toISOString().substring(0, 10), rates }
  }
}

const providers: FxProvider[] = [new OpenErProvider(), new FrankfurterProvider()]

serve(async (req: Request) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase service credentials' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let fetchResult: { date: string; rates: Record<string, number> } | null = null
  let providerUsed = ''

  for (const provider of providers) {
    try {
      fetchResult = await provider.fetchRates('USD')
      providerUsed = provider.name
      break
    } catch (err) {
      console.warn(`Provider ${provider.name} failed:`, err)
    }
  }

  if (!fetchResult) {
    return new Response(JSON.stringify({ error: 'All FX providers failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { date, rates } = fetchResult
  const rows = Object.entries(rates).map(([quote, ratePerUsd]) => ({
    date,
    quote: quote.toUpperCase(),
    rate_per_usd: ratePerUsd,
  }))

  // Upsert in batches of 100 into fx_rates
  const BATCH_SIZE = 100
  let upsertedCount = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('fx_rates').upsert(batch, {
      onConflict: 'date,quote',
    })

    if (error) {
      console.error('Error upserting fx_rates batch:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    upsertedCount += batch.length
  }

  return new Response(
    JSON.stringify({
      success: true,
      provider: providerUsed,
      date,
      upserted: upsertedCount,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
})
