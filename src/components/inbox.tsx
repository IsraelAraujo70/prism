import {
  Bell,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Inbox as InboxIcon,
  RefreshCw,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { api, type NotificationRow, type PullRequestRef } from '@/lib/api'
import { iconForReason, labelForReason } from '@/lib/reasons'
import { useNotifications } from '@/lib/use-notifications'

const COLLAPSED_KEY = 'prism.collapsed-inbox-repos'

type Props = {
  onSelectPr: (pr: PullRequestRef) => void
}

type Cluster = {
  key: string
  items: NotificationRow[]
  representative: NotificationRow
  unread: number
  latest: string
  oldest: string
}

type Group = {
  repo: string
  clusters: Cluster[]
  unread: number
  total: number
  latest: string
}

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveCollapsed(set: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]))
}

function clusterKey(item: NotificationRow): string {
  return `${item.repo_full}|${item.subject_type}|${item.pr_number ?? ''}|${item.title}`
}

export function Inbox({ onSelectPr }: Props) {
  const {
    items,
    unread,
    loading,
    markRead,
    markAllRead,
    markRepoRead,
    syncNow,
  } = useNotifications()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(() =>
    loadCollapsed(),
  )
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(
    () => new Set(),
  )

  const groups = useMemo<Group[]>(() => {
    const repoMap = new Map<string, Map<string, Cluster>>()
    for (const item of items) {
      let clusterMap = repoMap.get(item.repo_full)
      if (!clusterMap) {
        clusterMap = new Map()
        repoMap.set(item.repo_full, clusterMap)
      }
      const key = clusterKey(item)
      let cluster = clusterMap.get(key)
      if (!cluster) {
        cluster = {
          key,
          items: [],
          representative: item,
          unread: 0,
          latest: item.updated_at,
          oldest: item.updated_at,
        }
        clusterMap.set(key, cluster)
      }
      cluster.items.push(item)
      if (item.unread) cluster.unread += 1
      if (item.updated_at > cluster.latest) {
        cluster.latest = item.updated_at
        cluster.representative = item
      }
      if (item.updated_at < cluster.oldest) cluster.oldest = item.updated_at
    }

    const out: Group[] = []
    for (const [repo, clusterMap] of repoMap) {
      const clusters = Array.from(clusterMap.values()).sort((a, b) =>
        a.latest > b.latest ? -1 : a.latest < b.latest ? 1 : 0,
      )
      let groupUnread = 0
      let groupTotal = 0
      let groupLatest = ''
      for (const c of clusters) {
        groupUnread += c.unread
        groupTotal += c.items.length
        if (c.latest > groupLatest) groupLatest = c.latest
      }
      out.push({
        repo,
        clusters,
        unread: groupUnread,
        total: groupTotal,
        latest: groupLatest,
      })
    }
    return out.sort((a, b) =>
      a.latest > b.latest ? -1 : a.latest < b.latest ? 1 : 0,
    )
  }, [items])

  function toggleRepo(repo: string) {
    setCollapsedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repo)) next.delete(repo)
      else next.add(repo)
      saveCollapsed(next)
      return next
    })
  }

  function toggleCluster(key: string) {
    setExpandedClusters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  async function handleClusterClick(cluster: Cluster) {
    if (cluster.items.length > 1) {
      toggleCluster(cluster.key)
      return
    }
    await handleClick(cluster.representative)
  }

  async function handleMarkRepoRead(repo: string) {
    setError(null)
    try {
      await markRepoRead(repo)
    } catch (e) {
      setError(String(e))
    }
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
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <RepoSection
                key={group.repo}
                group={group}
                collapsed={collapsedRepos.has(group.repo)}
                expandedClusters={expandedClusters}
                onToggleRepo={() => toggleRepo(group.repo)}
                onClusterClick={handleClusterClick}
                onItemClick={handleClick}
                onMarkRepoRead={() => handleMarkRepoRead(group.repo)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function RepoSection({
  group,
  collapsed,
  expandedClusters,
  onToggleRepo,
  onClusterClick,
  onItemClick,
  onMarkRepoRead,
}: {
  group: Group
  collapsed: boolean
  expandedClusters: Set<string>
  onToggleRepo: () => void
  onClusterClick: (cluster: Cluster) => void
  onItemClick: (item: NotificationRow) => void
  onMarkRepoRead: () => void
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="group flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onToggleRepo}
          className="flex flex-1 items-center gap-1.5 rounded-md py-1 text-left transition-colors hover:bg-accent/40"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
          />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {group.repo}
          </span>
          {group.unread > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              {group.unread}
            </span>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground/40">
            {group.total}
          </span>
        </button>
        {group.unread > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMarkRepoRead()
            }}
            title="Marcar este repo como lido"
            className="rounded-md p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!bg-accent hover:!text-foreground"
          >
            <CheckCheck className="size-3.5" />
          </button>
        )}
      </div>
      {!collapsed && (
        <ul className="flex flex-col gap-0.5">
          {group.clusters.map((cluster) => (
            <ClusterRow
              key={cluster.key}
              cluster={cluster}
              expanded={expandedClusters.has(cluster.key)}
              onClick={() => onClusterClick(cluster)}
              onItemClick={onItemClick}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ClusterRow({
  cluster,
  expanded,
  onClick,
  onItemClick,
}: {
  cluster: Cluster
  expanded: boolean
  onClick: () => void
  onItemClick: (item: NotificationRow) => void
}) {
  const item = cluster.representative
  const Icon = iconForReason(item.reason)
  const externalUrl = htmlUrlFromSubject(item)
  const collapsedCluster = cluster.items.length > 1
  const showUnreadDot = cluster.unread > 0

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
          showUnreadDot
            ? 'border-border bg-card hover:bg-accent'
            : 'border-transparent hover:bg-accent'
        }`}
      >
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {showUnreadDot ? (
            <span className="size-2 rounded-full bg-primary" />
          ) : (
            <Icon className="size-3.5 text-muted-foreground/50" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${showUnreadDot ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
            >
              {item.title}
            </span>
            {item.pr_number !== null && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/50">
                #{item.pr_number}
              </span>
            )}
            {collapsedCluster && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                ×{cluster.items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3" />
              {labelForReason(item.reason)}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              {collapsedCluster
                ? `${relativeTime(cluster.latest)} – ${relativeTime(cluster.oldest)}`
                : relativeTime(item.updated_at)}
            </span>
            {collapsedCluster && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="inline-flex items-center gap-0.5 text-muted-foreground/50">
                  <ChevronRight
                    className={`size-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                  />
                  {expanded ? 'recolher' : 'expandir'}
                </span>
              </>
            )}
          </div>
        </div>

        {externalUrl && !collapsedCluster && (
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

      {collapsedCluster && expanded && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-7">
          {cluster.items.map((sub) => (
            <ClusterChild key={sub.id} item={sub} onClick={() => onItemClick(sub)} />
          ))}
        </ul>
      )}
    </li>
  )
}

function ClusterChild({
  item,
  onClick,
}: {
  item: NotificationRow
  onClick: () => void
}) {
  const externalUrl = htmlUrlFromSubject(item)
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
      >
        <span className="flex size-2 shrink-0 items-center justify-center">
          {item.unread ? (
            <span className="size-1.5 rounded-full bg-primary" />
          ) : (
            <span className="size-1 rounded-full bg-muted-foreground/30" />
          )}
        </span>
        <span
          className={`truncate ${item.unread ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {relativeTime(item.updated_at)}
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="truncate text-muted-foreground/60">
          {labelForReason(item.reason)}
        </span>
        {externalUrl && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              api.openUrl(externalUrl)
            }}
            title="Abrir no GitHub"
            className="ml-auto shrink-0 rounded-md p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!bg-accent hover:!text-foreground"
          >
            <ExternalLink className="size-3" />
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
