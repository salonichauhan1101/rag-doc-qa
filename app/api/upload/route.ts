import { NextRequest, NextResponse } from 'next/server'
        import { supabaseServer } from '@/lib/supabase'
        import { embedText } from '@/lib/gemini'
        import pdf from 'pdf-parse'

        export const runtime = 'nodejs'

        // Extracts text page-by-page (not just as one big blob) so we can
        // later tell the user which page an answer came from.
        async function extractPagesFromPdf(
        buffer: Buffer
        ): Promise<{ pageNumber: number; text: string }[]> {
        const pages: { pageNumber: number; text: string }[] = []
        let pageNumber = 0

        await pdf(buffer, {
        pagerender: async (pageData: any) => {
        pageNumber++
        const textContent = await pageData.getTextContent()
        const text = textContent.items.map((item: any) => item.str).join(' ')
        pages.push({ pageNumber, text })
        return text
        },
        })

        return pages
        }

        // Splits a page's text into overlapping ~150-word chunks.
        // Overlap matters: without it, a sentence that spans a chunk boundary
        // loses context and hurts retrieval quality.
        function chunkText(text: string, chunkSize = 150, overlap = 30): string[] {
        const words = text.split(/\s+/).filter(Boolean)
        const chunks: string[] = []
        let start = 0
        while (start < words.length) {
        const end = Math.min(start + chunkSize, words.length)
        chunks.push(words.slice(start, end).join(' '))
        if (end === words.length) break
        start += chunkSize - overlap
        }
        return chunks
        }

        export async function POST(request: NextRequest) {
        try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const userId = formData.get('userId') as string | null

        if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }
        if (!userId) {
        return NextResponse.json({ error: 'No user id provided' }, { status: 400 })
        }
        if (file.type !== 'application/pdf') {
        return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        // 1. Save the raw PDF to Supabase Storage
        const storagePath = `${userId}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabaseServer.storage
        .from('pdfs')
        .upload(storagePath, buffer, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError

        // 2. Create the parent "documents" row
        const { data: docRow, error: docError } = await supabaseServer
        .from('documents')
        .insert({ user_id: userId, filename: file.name, storage_path: storagePath })
        .select()
        .single()
        if (docError) throw docError

        // 3. Extract text per page
        const pages = await extractPagesFromPdf(buffer)

        // 4. Chunk each page, embed each chunk, store in the chunks table
        let totalChunks = 0
        for (const page of pages) {
        const pageChunks = chunkText(page.text)
        for (const chunkContent of pageChunks) {
        if (!chunkContent.trim()) continue
        const embedding = await embedText(chunkContent, 'RETRIEVAL_DOCUMENT')
        const { error: chunkError } = await supabaseServer.from('chunks').insert({
        document_id: docRow.id,
        content: chunkContent,
        page_number: page.pageNumber,
        embedding,
        })
        if (chunkError) throw chunkError
        totalChunks++
        }
        }

        return NextResponse.json({ documentId: docRow.id, pages: pages.length, chunks: totalChunks })
        } catch (err: any) {
        console.error('Upload error:', err)
        return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
        }
        }