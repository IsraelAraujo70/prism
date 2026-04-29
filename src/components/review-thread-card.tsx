import { Check, MessageSquare } from 'lucide-react'

import { CommentRow } from '@/components/comment-card'
import type { ThreadComment } from '@/lib/api'
import { formatAbsolute, formatRelative } from '@/lib/format'

export type ReviewThread = {
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
}: {
  thread: ReviewThread
  showFile?: boolean
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
    </li>
  )
}
