import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebPushNotification {
  userId: string
  title: string
  body: string
  url: string
  dedupeKey: string
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const today = new Date().toISOString().split('T')[0]
    const notificationsToDispatch: WebPushNotification[] = []

    // 1. Check due/upcoming recurring bills (remind_only or auto_post)
    const { data: recurringRules, error: recurringError } = await supabase
      .from('recurring_rules')
      .select('id, user_id, name, amount_minor, next_date, remind_days_before')
      .is('deleted_at', null)
      .lte('next_date', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])

    if (!recurringError && recurringRules) {
      for (const rule of recurringRules) {
        const remindDays = rule.remind_days_before ?? 2
        const dueDate = new Date(rule.next_date)
        const remindDate = new Date(dueDate.getTime() - remindDays * 86400000).toISOString().split('T')[0]

        if (today >= remindDate) {
          notificationsToDispatch.push({
            userId: rule.user_id,
            title: `Bill Reminder: ${rule.name}`,
            body: `Due on ${rule.next_date}. Don't forget to pay or record it.`,
            url: '/bills',
            dedupeKey: `bill-${rule.id}-${rule.next_date}`,
          })
        }
      }
    }

    // 2. Check loan EMI due dates
    const { data: loans, error: loanError } = await supabase
      .from('loans')
      .select('id, user_id, name, monthly_payment_minor, start_date')
      .is('deleted_at', null)

    if (!loanError && loans) {
      const currentDay = new Date().getDate()
      for (const loan of loans) {
        const startDay = new Date(loan.start_date).getDate()
        // If within 3 days of EMI day
        if (Math.abs(startDay - currentDay) <= 3) {
          notificationsToDispatch.push({
            userId: loan.user_id,
            title: `Loan EMI Reminder: ${loan.name}`,
            body: `Your loan payment is due around day ${startDay} of this month.`,
            url: '/loans',
            dedupeKey: `loan-${loan.id}-${today.substring(0, 7)}`,
          })
        }
      }
    }

    let createdCount = 0

    // 3. Insert in-app notifications with dedupe_key
    for (const item of notificationsToDispatch) {
      // Check if notification already exists with this dedupe_key
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', item.userId)
        .eq('dedupe_key', item.dedupeKey)
        .is('deleted_at', null)
        .maybeSingle()

      if (!existing) {
        const { error: insertError } = await supabase.from('notifications').insert({
          user_id: item.userId,
          title: item.title,
          body: item.body,
          type: 'bill_reminder',
          dedupe_key: item.dedupeKey,
          data: { url: item.url },
        })

        if (!insertError) {
          createdCount++
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatchedCandidates: notificationsToDispatch.length,
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
