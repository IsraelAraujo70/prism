import {
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Reply,
} from 'lucide-react'
import { useState } from 'react'

import { CommentRow } from '@/components/comment-card'
import type { ThreadComment } from '@/lib/api'
import { formatAbsolute, formatRelative } from '@/lib/format'

export type ReviewThread = {
  id: string
  path: string
  line: number | null
  is_resolved: boolean
  is_outdated: boolean
  comments: ThreadComment[]
  created_at: string
}

export function ReviewThreadCard({
  thread,
  showFile = true,
  onReply,
  onResolveToggle,
}: {
  thread: ReviewThread
  showFile?: boolean
  onReply?: (body: string) => Promise<void>
  onResolveToggle?: () => Promise<void>
}) {
  const first = thread.comments[0]
  return (
    <li className="rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3.5" />
          {first?.author ? `${first.author.login} comentou` : 'comentário'}
          {showFile ? ' em' : ''}
        </span>
        {showFile && (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
            {thread.path}
            {thread.line != null && (
              <span className="text-muted-foreground"> :{thread.line}</span>
            )}
          </code>
        )}
        {thread.is_resolved && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
            <Check className="size-3" />
            resolved
          </span>
        )}
        {thread.is_outdated && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            outdated
          </span>
        )}
        {first && (
          <span
            className="ml-auto text-xs text-muted-foreground/70"
            title={formatAbsolute(first.created_at)}
          >
            {formatRelative(first.created_at)}
          </span>
        )}
      </header>
      <ul className="flex flex-col">
        {thread.comments.map((c, i) => (
          <li key={i} className={i > 0 ? 'border-t border-border/60' : ''}>
            <CommentRow
              author={c.author}
              createdAt={c.created_at}
              body={c.body}
              state={c.state}
              showAuthor={i > 0}
            />
          </li>
        ))}
      </ul>
      {(onReply || onResolveToggle) && (
        <ThreadFooter
          thread={thread}
          onReply={onReply}
          onResolveToggle={onResolveToggle}
        />
      )}
    </li>
  )
}

function ThreadFooter({
  thread,
  onReply,
  onResolveToggle,
}: {
  thread: ReviewThread
  onReply?: (body: string) => Promise<void>
  onResolveToggle?: () => Promise<void>
}) {
  const [composing, setComposing] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!onReply || body.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await onReply(body)
      setBody('')
      setComposing(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleResolve = async () => {
    if (!onResolveToggle) return
    setBusy(true)
    setError(null)
    try {
      await onResolveToggle()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-border/60 px-4 py-2.5">
      {composing && onReply && (
        <div className="mb-2 flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva uma resposta…"
            rows={3}
            disabled={busy}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30 disabled:opacity-50"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || body.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Reply className="size-3.5" />
              )}
              Responder
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false)
                setBody('')
                setError(null)
              }}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!composing && onReply && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Reply className="size-3.5" />
            Responder
          </button>
        )}
        {onResolveToggle && (
          <button
            type="button"
            onClick={toggleResolve}
            disabled={busy}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
              thread.is_resolved
                ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {thread.is_resolved ? 'Reabrir' : 'Resolver'}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
