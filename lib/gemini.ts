const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
        const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

        // L2-normalize a vector — required by Google when using output_dimensionality
        // below the model's default (3072). Without this, cosine similarity search
        // gives inaccurate results.
        function normalize(vector: number[]): number[] {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
        return vector.map((val) => val / magnitude)
        }

        // Turns a piece of text into a 768-dimension vector.
        // taskType differs depending on whether we're embedding a document chunk
        // (when uploading) or a user's question (when querying) — Google's model
        // produces better results when it knows which one it's doing.
        export async function embedText(
        text: string,
        taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
        ): Promise<number[]> {
        const response = await fetch(`${BASE_URL}/gemini-embedding-001:embedContent`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 768,
        }),
        })

        if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini embedding failed: ${errorText}`)
        }

        const data = await response.json()
        const rawEmbedding: number[] = data.embedding.values
        return normalize(rawEmbedding)
        }

        // Sends the retrieved chunks + the user's question to Gemini Flash and
        // gets back a grounded answer.
        export async function generateAnswer(
        question: string,
        contextChunks: { content: string; page_number: number }[]
        ): Promise<string> {
const context = contextChunks
.map((chunk) => `[Page ${chunk.page_number}]\n${chunk.content}`)
.join('\n\n---\n\n')

const prompt = `You are answering questions about a document using only the context provided below. If the answer isn't in the context, say so clearly instead of guessing.

Context:
${context}

Question: ${question}

Answer using only the context above. Mention which page(s) your answer comes from.`

const response = await fetch(`${BASE_URL}/gemini-flash-latest:generateContent`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-goog-api-key': GEMINI_API_KEY,
},
body: JSON.stringify({
contents: [{ parts: [{ text: prompt }] }],
}),
})

if (!response.ok) {
const errorText = await response.text()
throw new Error(`Gemini generation failed: ${errorText}`)
}

const data = await response.json()
return data.candidates[0].content.parts[0].text
}