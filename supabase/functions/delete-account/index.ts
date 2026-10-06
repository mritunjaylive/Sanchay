import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

  // Verify the JWT to get the user ID
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token)

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = user.id

  try {
    // 1. Delete user files from 'receipts' storage bucket
    try {
      // list() returns at most `limit` entries per call, so page until the folder is empty.
      const PAGE = 100
      for (let guard = 0; guard < 1000; guard++) {
        const { data: files, error: listError } = await adminClient.storage
          .from('receipts')
          .list(userId, { limit: PAGE })
        if (listError) throw listError
        if (!files || files.length === 0) break

        const filePaths = files.map((f) => `${userId}/${f.name}`)
        const { error: removeError } = await adminClient.storage.from('receipts').remove(filePaths)
        if (removeError) throw removeError
        if (files.length < PAGE) break
      }
    } catch (storageErr) {
      console.warn('Storage cleanup warning:', storageErr)
    }

    // 2. Delete all rows belonging to the user in dependency order
    // Children first: tables are linked by foreign keys without ON DELETE CASCADE.
    const tablesToDelete = [
      'notifications',
      'saved_filters',
      'transaction_tags',
      'attachments',
      'goal_contributions',
      'recurring_overrides',
      'budgets',
      'transactions',
      'loan_terms',
      'goals',
      'recurring_rules',
      'tags',
      'categories',
      'accounts',
      'push_subscriptions',
      'sync_purge_state',
      'profiles',
    ]

    for (const table of tablesToDelete) {
      const { error: deleteError } = await adminClient.from(table).delete().eq('user_id', userId)
      if (deleteError) {
        throw new Error(`Failed to delete ${table}: ${deleteError.message}`)
      }
    }

    // 3. Delete the auth user
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteUserError) {
      throw new Error(`Failed to delete auth user: ${deleteUserError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account and all associated personal data permanently deleted',
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
