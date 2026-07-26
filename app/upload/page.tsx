'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [documentId, setDocumentId] = useState<string | null>(null)

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
      } else {
        setUser(data.user)
      }
    })
  }, [router])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !user) return

    setStatus('uploading')
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setStatus('done')
      setMessage(`Success — indexed ${data.pages} pages into ${data.chunks} chunks.`)
      setDocumentId(data.documentId)
    } catch (err: any) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  if (!user) return null

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <form onSubmit={handleUpload} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Upload a PDF</h1>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={!file || status === 'uploading'}
          className="w-full rounded-md bg-black px-3 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {status === 'uploading' ? 'Uploading…' : 'Upload and index'}
        </button>
        {message && (
          <p className={status === 'error' ? 'text-red-600' : 'text-green-600'}>{message}</p>
        )}
        {documentId && (

            <a href={`/chat/${documentId}`}
            className="block text-center rounded-md border border-black px-3 py-2 hover:bg-gray-50"
          >
            Chat with this document →
          </a>
        )}
      </form>
    </main>
  )
}