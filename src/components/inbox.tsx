import {
  Activity,
  AtSign,
  Bell,
  CheckCheck,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Inbox as InboxIcon,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { api, type NotificationRow, type PullRequestRef } from '@/lib/api'
import { useNotifications } from '@/lib/use-notifications'

type Props = {
  onSelectPr: (pr: PullRequestRef) => void
}

type Group = {
  repo: string
  items: NotificationRow[]
  latest: string
}

export function Inbox({ onSelectPr }: Props) {
  const { items, unread, loading, markRead, markAllRead, syncNow } =
    useNotifications()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const item of items) {
      let group = map.get(item.repo_full)
      if (!group) {
        group = { repo: item.repo_full, items: [], latest: item.updated_at }
        map.set(item.repo_full, group)
      }
      group.items.push(item)
      if (item.updated_at > group.latest) group.latest = item.updated_at
    }
    return Array.from(map.values()).sort((a, b) =>
      a.latest > b.latest ? -1 : a.latest < b.latest ? 1 : 0,
    )
  }, [items])

  async function handleSync() {
    setError(null)
    setSyncing(true)
    try {
      await syncNow()
    } catch (e) {
      setError(String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function handleClick(item: NotificationRow) {
    if (item.unread) {
      try {
        await markRead(item.id)
      } catch {
        /* keep going even if mark-read fails */
      }
    }
    if (item.subject_type === 'PullRequest' && item.pr_number !== null) {
      onSelectPr(notificationToPr(item))
      return
    }
    const url = htmlUrlFromSubject(item)
    if (url) api.openUrl(url)
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="flex items-center gap-2">
          <InboxIcon className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold tracking-tight">
            Caixa de entrada
          </h1>
          {unread > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
              {unread}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            title="Sincronizar agora"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <CheckCheck className="size-3.5" />
            Marcar tudo como lido
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading && groups.length === 0 && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground/70">
              Nada na sua caixa de entrada.
            </p>
            <p className="text-xs text-muted-foreground/50">
              Quando alguém mencionar você ou pedir review, aparece aqui.
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.repo} className="flex flex-col gap-1">
                <h2 className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.repo}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NotificationItem
                      key={item.id}
                      item={item}
                      onClick={() => handleClick(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function NotificationItem({
  item,
  onClick,
}: {
  item: NotificationRow
  onClick: () => void
}) {
  const Icon = iconForReason(item.reason)
  const externalUrl = htmlUrlFromSubject(item)

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
          item.unread
            ? 'border-border bg-card hover:bg-accent'
            : 'border-transparent hover:bg-accent'
        }`}
      >
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {item.unread ? (
            <span className="size-2 rounded-full bg-primary" />
          ) : (
            <Icon className="size-3.5 text-muted-foreground/50" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${item.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
            >
              {item.title}
            </span>
            {item.pr_number !== null && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/50">
                #{item.pr_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3" />
              {labelForReason(item.reason)}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>{relativeTime(item.updated_at)}</span>
          </div>
        </div>

        {externalUrl && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              api.openUrl(externalUrl)
            }}
            title="Abrir no GitHub"
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!bg-accent hover:!text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </span>
        )}
      </button>
    </li>
  )
}

function notificationToPr(item: NotificationRow): PullRequestRef {
  const [owner, name] = item.repo_full.split('/')
  const html = htmlUrlFromSubject(item) ?? `https://github.com/${owner}/${name}`
  return {
    id: 0,
    number: item.pr_number ?? 0,
    title: item.title,
    html_url: html,
    repo: item.repo_full,
    author: { login: '', avatar_url: '' },
    updated_at: item.updated_at,
    comments: 0,
    draft: false,
  }
}

function htmlUrlFromSubject(item: NotificationRow): string | null {
  if (!item.subject_url) return null
  return item.subject_url
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/')
}

const REASON_LABELS: Record<string, string> = {
  review_requested: 'Pediram seu review',
  mention: 'Mencionado',
  team_mention: 'Time mencionado',
  comment: 'Comentário',
  author: 'Autor',
  assign: 'Atribuído',
  state_change: 'Mudança de estado',
  ci_activity: 'CI',
  subscribed: 'Inscrito',
  push: 'Novo commit',
  security_alert: 'Alerta de segurança',
  manual: 'Manual',
}

function labelForReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')
}

const REASON_ICONS: Record<string, LucideIcon> = {
  review_requested: GitPullRequest,
  mention: AtSign,
  team_mention: AtSign,
  comment: MessageSquare,
  author: GitPullRequest,
  assign: UserPlus,
  state_change: GitMerge,
  ci_activity: Activity,
  push: GitMerge,
  security_alert: ShieldAlert,
}

function iconForReason(reason: string): LucideIcon {
  return REASON_ICONS[reason] ?? Bell
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'agora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `há ${diffD}d`
  const diffMo = Math.floor(diffD / 30)
  if (diffMo < 12) return `há ${diffMo}mês${diffMo > 1 ? 'es' : ''}`
  const diffY = Math.floor(diffMo / 12)
  return `há ${diffY}a`
}
