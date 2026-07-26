import { createClient } from '@supabase/supabase-js'

        // Verifies the bearer token from an incoming request and returns the
        // authenticated user's id, or null if the token is missing/invalid.
        // This is what stops someone from spoofing a different userId in the
        // request body — the server checks the actual Supabase session token
        // instead of trusting whatever the client claims.
        export async function getVerifiedUserId(request: Request): Promise<string | null> {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) return null

        const token = authHeader.replace('Bearer ', '')

        const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { data, error } = await supabase.auth.getUser(token)
        if (error || !data.user) return null

        return data.user.id
        }