import { NextRequest, NextResponse } from 'next/server'
        import { supabaseServer } from '@/lib/supabase-server'
        import { embedText } from '@/lib/gemini'
        // Import this before PDFParse — provides a Node-compatible canvas
        // implementation so pdf.js doesn't try to use browser-only DOMMatrix
        import { CanvasFactory } from 'pdf-parse/worker'
        import { PDFParse } from 'pdf-parse'

        export const runtime = 'nodejs'

        // Extracts text page-by-page using pdf-parse's v2 API.
        // We get the total page count first, then pull each page's text
        // individually so we can tag every chunk with its page number later.
        async function extractPagesFromPdf(
        buffer: Buffer
        ): Promise<{ pageNumber: number; text: string }[]> {
        const parser = new PDFParse({ data: buffer, CanvasFactory })

        try {
        const info = await parser.getInfo()
        const totalPages = info.total
        const pages: { pageNumber: number; text: string }[] = []

        for (let i = 1; i <= totalPages; i++) {
        const result = await parser.getText({ partial: [i] })
        pages.push({ pageNumber: i, text: result.text })
        }

        return pages
        } finally {
        await parser.destroy() // always free memory, even if something throws
        }
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