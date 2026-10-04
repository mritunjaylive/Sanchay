import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      const { data: files } = await adminClient.storage
        .from('receipts')
        .list(userId)

      if (files && files.length > 0) {
        const filePaths = files.map((f) => `${userId}/${f.name}`)
        await adminClient.storage.from('receipts').remove(filePaths)
      }
    } catch (storageErr) {
      console.warn('Storage cleanup warning:', storageErr)
    }

    // 2. Delete all rows belonging to the user in dependency order
    const tablesToDelete = [
      'notifications',
      'goal_contributions',
      'goals',
      'loan_payments',
      'loans',
      'recurring_rules',
      'budgets',
      'transactions',
      'categories',
      'accounts',
      'saved_filters',
      'push_subscriptions',
      'profiles',
    ]

    for (const table of tablesToDelete) {
      await adminClient.from(table).delete().eq('user_id', userId)
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
