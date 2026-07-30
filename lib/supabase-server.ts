import { createClient } from '@supabase/supabase-js'

        // ONLY import this in API routes (app/api/**/route.ts) — never in a
        // 'use client' component. It bypasses Row Level Security, so we manually
        // filter by user_id wherever we use it.
        export const supabaseServer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
        )