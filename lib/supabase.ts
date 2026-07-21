import { createClient } from '@supabase/supabase-js'

        // Used in the browser (login, session, etc.)
        // Respects Row Level Security — a user can only ever see their own data
        export const supabaseBrowser = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        // Used ONLY inside API routes (server-side) — never import this in a
        // client component. It bypasses Row Level Security, so we manually
        // filter by user_id wherever we use it.
        export const supabaseServer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
        )