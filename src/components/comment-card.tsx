import type { LucideIcon } from 'lucide-react'

import { Markdown } from '@/components/markdown'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PrAuthor } from '@/lib/api'
import { formatAbsolute, formatRelative } from '@/lib/format'

type Action = {
  label: string
  icon?: LucideIcon
  className?: string
}

export function CommentCard({
  author,
  createdAt,
  body,
  action,
  placeholderForEmpty = false,
}: {
  author: PrAuthor | null
  createdAt: string
  body: string
  action?: Action
  placeholderForEmpty?: boolean
}) {
  const hasBody = body.trim().length > 0
  return (
    <li className="rounded-xl bg-card ring-1 ring-foreground/10">
      <CommentHeader author={author} createdAt={createdAt} action={action} />
      {(hasBody || placeholderForEmpty) && (
        <div className="px-4 py-3">
          {hasBody ? (
            <Markdown>{body}</Markdown>
          ) : (
            <p className="text-sm italic text-muted-foreground">(sem texto)</p>
          )}
        </div>
      )}
    </li>
  )
}

export function CommentHeader({
  author,
  createdAt,
  action,
}: {
  author: PrAuthor | null
  createdAt: string
  action?: Action
}) {
  const ActionIcon = action?.icon
  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      {author && (
        <>
          <Avatar className="size-6">
            <AvatarImage src={author.avatar_url} alt={author.login} />
            <AvatarFallback className="bg-muted text-[9px] font-semibold">
              {author.login.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-foreground">
            {author.login}
          </span>
        </>
      )}
      {action && (
        <span
          className={`inline-flex items-center gap-1 text-xs ${action.className ?? 'text-muted-foreground'}`}
        >
          {ActionIcon && <ActionIcon className="size-3.5" />}
          {action.label}
        </span>
      )}
      <span
        className="ml-auto text-xs text-muted-foreground/70"
        title={formatAbsolute(createdAt)}
      >
        {formatRelative(createdAt)}
      </span>
    </header>
  )
}

export function CommentRow({
  author,
  createdAt,
  body,
  state,
  showAuthor,
}: {
  author: PrAuthor | null
  createdAt: string
  body: string
  state?: string | null
  showAuthor: boolean
}) {
  const hasBody = body.trim().length > 0
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {showAuthor && author && (
        <Avatar className="size-5 mt-0.5">
          <AvatarImage src={author.avatar_url} alt={author.login} />
          <AvatarFallback className="bg-muted text-[8px] font-semibold">
            {author.login.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        {showAuthor && author && (
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {author.login}
            </span>
            {state === 'PENDING' && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                pending
              </span>
            )}
            <span
              className="text-[11px] text-muted-foreground/70"
              title={formatAbsolute(createdAt)}
            >
              {formatRelative(createdAt)}
            </span>
          </div>
        )}
        {hasBody ? (
          <Markdown>{body}</Markdown>
        ) : (
          <p className="text-sm italic text-muted-foreground">(sem texto)</p>
        )}
      </div>
    </div>
  )
}
