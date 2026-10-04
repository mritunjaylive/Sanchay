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

  const client = createClient(supabaseUrl, supabaseServiceKey)

  // Verify the JWT to get the user ID
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await client.auth.getUser(token)

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = user.id

  try {
    const tables = [
      'profiles',
      'accounts',
      'categories',
      'transactions',
      'budgets',
      'recurring_rules',
      'loans',
      'loan_payments',
      'goals',
      'goal_contributions',
      'notifications',
    ]

    const exportPayload: Record<string, unknown[]> = {}

    for (const table of tables) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('user_id', userId)

      if (error) {
        console.warn(`Export error on table ${table}:`, error)
      } else {
        exportPayload[table] = data ?? []
      }
    }

    const result = {
      app: 'Sanchay',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      data: exportPayload,
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="sanchay-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
