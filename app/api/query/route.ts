import { NextRequest, NextResponse } from 'next/server'
        import { supabaseServer } from '@/lib/supabase-server'
        import { embedText, generateAnswer } from '@/lib/gemini'

        export async function POST(request: NextRequest) {
        try {
        const { documentId, userId, question } = await request.json()

        if (!documentId || !userId || !question) {
        return NextResponse.json(
        { error: 'documentId, userId, and question are all required' },
        { status: 400 }
        )
        }



        // Security check: supabaseServer bypasses RLS, so we manually confirm
        // this document actually belongs to the requesting user before
        // running any search against it.
        const { data: doc, error: docError } = await supabaseServer
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('user_id', userId)
        .single()

        if (docError || !doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // 1. Embed the user's question — note taskType is RETRIEVAL_QUERY here,
        // not RETRIEVAL_DOCUMENT (that's only for embedding chunks on upload).
        const questionEmbedding = await embedText(question, 'RETRIEVAL_QUERY')

        // 2. Find the most similar chunks via Postgres cosine similarity search
        const { data: matches, error: matchError } = await supabaseServer.rpc(
        'match_chunks',
        {
        query_embedding: questionEmbedding,
        match_document_id: documentId,
        match_count: 5,
        }
        )
        if (matchError) throw matchError

        if (!matches || matches.length === 0) {
        return NextResponse.json({
        answer: "I couldn't find anything relevant to that question in the document.",
        sources: [],
        })
        }

        // 3. Feed the retrieved chunks + question to Gemini for a grounded answer
        const answer = await generateAnswer(question, matches)

        return NextResponse.json({
        answer,
        sources: matches.map((m: any) => ({
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