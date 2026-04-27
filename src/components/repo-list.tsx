import { ChevronRight, GitFork, Lock, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AddRepoDialog } from '@/components/add-repo-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type WatchedRepo } from '@/lib/api'

const COLLAPSED_KEY = 'prism.collapsed-orgs'

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: WatchedRepo[] }
  | { status: 'error'; message: string }

type Group = {
  owner: string
  avatar: string
  repos: WatchedRepo[]
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

export function RepoList() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed())

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const repos = await api.getWatchedRepos()
      setState({ status: 'ready', repos })
    } catch (err) {
      setState({ status: 'error', message: String(err) })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const watchedIds = new Set(
    state.status === 'ready' ? state.repos.map((r) => r.id) : [],
  )

  const groups = useMemo<Group[]>(() => {
    if (state.status !== 'ready') return []
    const map = new Map<string, Group>()
    for (const repo of state.repos) {
      const key = repo.owner_login
      if (!map.has(key)) {
        map.set(key, {
          owner: key,
          avatar: repo.owner_avatar_url,
          repos: [],
        })
      }
      map.get(key)!.repos.push(repo)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' }),
    )
  }, [state])

  function toggleGroup(owner: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(owner)) {
        next.delete(owner)
      } else {
        next.add(owner)
      }
      saveCollapsed(next)
      return next
    })
  }

  async function removeRepo(id: number) {
    await api.removeWatchedRepo(id)
    load()
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Observando
          {state.status === 'ready' && (
            <span className="ml-1.5 text-sidebar-foreground/30">
              {state.repos.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={load}
            disabled={state.status === 'loading'}
            className="rounded-md p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw
              className={`size-3.5 ${state.status === 'loading' ? 'animate-spin' : ''}`}
            />
          </button>
          <AddRepoDialog watchedIds={watchedIds} onChanged={load} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
        {state.status === 'loading' && (
          <div className="flex flex-col gap-0.5 px-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-10 w-full rounded-md bg-sidebar-accent/40"
              />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className="mx-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {state.message}
          </div>
        )}

        {state.status === 'ready' && state.repos.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <GitFork className="size-8 text-sidebar-foreground/20" />
            <p className="text-xs text-sidebar-foreground/40">
              Nenhum repositório adicionado.
            </p>
            <p className="text-xs text-sidebar-foreground/30">
              Clique no <strong>+</strong> acima para começar.
            </p>
          </div>
        )}

        {state.status === 'ready' && groups.length > 0 && (
          <div className="flex flex-col gap-1">
            {groups.map((group) => (
              <OrgGroup
                key={group.owner}
                group={group}
                collapsed={collapsed.has(group.owner)}
                onToggle={() => toggleGroup(group.owner)}
                onRemove={removeRepo}
              />
            ))}
          </div>
        )}
      </nav>
    </>
  )
}

function OrgGroup({
  group,
  collapsed,
  onToggle,
  onRemove,
}: {
  group: Group
  collapsed: boolean
  onToggle: () => void
  onRemove: (id: number) => void
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
        />
        <Avatar className="size-4 shrink-0 rounded-sm">
          <AvatarImage src={group.avatar} alt={group.owner} />
          <AvatarFallback className="rounded-sm bg-sidebar-accent text-[9px] font-semibold">
            {group.owner.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground/80 group-hover:text-sidebar-foreground">
          {group.owner}
        </span>
        <span className="shrink-0 text-xs text-sidebar-foreground/30 tabular-nums">
          {group.repos.length}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-0.5 pl-3 pt-0.5">
          {group.repos.map((repo) => (
            <WatchedRepoItem
              key={repo.id}
              repo={repo}
              onRemove={() => onRemove(repo.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WatchedRepoItem({
  repo,
  onRemove,
}: {
  repo: WatchedRepo
  onRemove: () => void
}) {
  return (
    <div className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-sidebar-accent">
      <button type="button" className="flex flex-1 items-center gap-2 min-w-0">
        <GitFork className="size-3.5 shrink-0 text-sidebar-foreground/30 transition-colors group-hover:text-sidebar-foreground/60" />
        <span className="truncate text-sm text-sidebar-foreground/80 group-hover:text-sidebar-foreground">
          {repo.name}
        </span>
        {repo.private && (
          <Lock className="size-3 shrink-0 text-sidebar-foreground/25" />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="rounded-md p-1 text-sidebar-foreground/0 transition-colors group-hover:text-sidebar-foreground/40 hover:!text-destructive hover:!bg-destructive/10"
        aria-label={`Remover ${repo.name}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
