import { NextRequest, NextResponse } from 'next/server'
        import { supabaseServer } from '@/lib/supabase-server'
        import { embedText, generateAnswer } from '@/lib/gemini'
        import { getVerifiedUserId } from '@/lib/auth'

        // Chunks below this similarity score are treated as "not actually relevant"
        // rather than fed to Gemini — otherwise match_chunks always returns its
        // top 5 closest chunks even when none of them are a good match, and Gemini
        // may still generate a plausible-sounding answer from irrelevant content.
        const SIMILARITY_THRESHOLD = 0.5

        export async function POST(request: NextRequest) {
        try {
        const userId = await getVerifiedUserId(request)
        if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { documentId, question } = await request.json()

        if (!documentId || !question) {
        return NextResponse.json(
        { error: 'documentId and question are required' },
        { status: 400 }
        )
        }

        const { data: doc, error: docError } = await supabaseServer
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('user_id', userId)
        .single()

        if (docError || !doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        const questionEmbedding = await embedText(question, 'RETRIEVAL_QUERY')

        const { data: matches, error: matchError } = await supabaseServer.rpc(
        'match_chunks',
        {
        query_embedding: questionEmbedding,
        match_document_id: documentId,
        match_count: 5,
        }
        )
        if (matchError) throw matchError

        const relevantMatches = (matches ?? []).filter(
        (m: any) => m.similarity >= SIMILARITY_THRESHOLD
        )

        if (relevantMatches.length === 0) {
        return NextResponse.json({
        answer:
        "I couldn't find anything in the document relevant to that question. Try rephrasing, or ask something more specific to its content.",
        sources: [],
        })
        }

        const answer = await generateAnswer(question, relevantMatches)

        return NextResponse.json({
        answer,
        sources: relevantMatches.map((m: any) => ({
        page: m.page_number,
        similarity: m.similarity,
        excerpt: m.content.slice(0, 150),
        })),
        })
        } catch (err: any) {
        console.error('Query error:', err)
        return NextResponse.json({ error: err.message || 'Query failed' }, { status: 500 })
        }
        }