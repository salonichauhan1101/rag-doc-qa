'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'

type Source = { page: number; similarity: number; excerpt: string }
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[] }

export default function ChatPage() {
  const router = useRouter()
  const params = useParams()
  const documentId = params.documentId as string

  const [user, setUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
      } else {
        setUser(data.user)
      }
    })
  }, [router])

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !user || loading) return

    const userMessage: Message = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMessage])
    setQuestion('')
    setLoading(true)
    setError('')

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId, question: userMessage.content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Query failed')

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, sources: data.sources },
      ])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Ask about your document</h1>

        <div className="space-y-4 min-h-[200px]">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={`inline-block rounded-lg px-4 py-2 max-w-[80%] ${
                  msg.role === 'user' ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-1 text-xs text-gray-500 text-left">
                  Sources: pages{' '}
                  {[...new Set(msg.sources.map((s) => s.page))].sort((a, b) => a - b).join(', ')}
                </div>
              )}
            </div>
          ))}
          {loading && <div className="text-sm text-gray-400">Thinking…</div>}
        </div>

        <form onSubmit={handleAsk} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the document…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Ask
          </button>
        </form>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </main>
  )
}