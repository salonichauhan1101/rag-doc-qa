import { createClient } from '@supabase/supabase-js'

        // Safe to import in any client component ('use client' files).
        // Respects Row Level Security — a user can only see their own data.
        export const supabaseBrowser = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )