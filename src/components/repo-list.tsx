import { GitFork, Lock, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Repo } from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: Repo[] }
  | { status: 'error'; message: string }

export function RepoList() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [filter, setFilter] = useState('')

  async function load() {
    setState({ status: 'loading' })
    try {
      const repos = await api.listRepos()
      setState({ status: 'ready', repos })
    } catch (err) {
      setState({ status: 'error', message: String(err) })
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return []
    if (!filter.trim()) return state.repos
    const q = filter.toLowerCase()
    return state.repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.full_name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q),
    )
  }, [state, filter])

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Repositórios
          {state.status === 'ready' && (
            <span className="ml-1.5 text-sidebar-foreground/30">
              {filtered.length}
            </span>
          )}
        </span>
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
      </div>

      {state.status === 'ready' && state.repos.length > 8 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/30" />
            <Input
              type="text"
              placeholder="Buscar repo..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 border-sidebar-border bg-sidebar-accent/50 pl-8 text-xs placeholder:text-sidebar-foreground/30 focus-visible:ring-sidebar-ring"
            />
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        <div className="flex flex-col gap-0.5">
          {state.status === 'loading' &&
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-10 w-full rounded-md bg-sidebar-accent/40"
              />
            ))}

          {state.status === 'error' && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.message}
            </div>
          )}

          {state.status === 'ready' && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-sidebar-foreground/40">
              {filter ? 'Nenhum repo encontrado.' : 'Nenhum repositório acessível.'}
            </p>
          )}

          {state.status === 'ready' &&
            filtered.map((repo) => <RepoItem key={repo.id} repo={repo} />)}
        </div>
      </nav>
    </>
  )
}

function RepoItem({ repo }: { repo: Repo }) {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-sidebar-accent"
    >
      <GitFork className="size-4 shrink-0 text-sidebar-foreground/30 transition-colors group-hover:text-sidebar-foreground/60" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-sidebar-foreground/90 group-hover:text-sidebar-foreground">
            {repo.name}
          </span>
          {repo.private && (
            <Lock className="size-3 shrink-0 text-sidebar-foreground/25" />
          )}
        </div>
        {repo.description && (
          <p className="truncate text-xs text-sidebar-foreground/40 group-hover:text-sidebar-foreground/55">
            {repo.description}
          </p>
        )}
      </div>
    </button>
  )
}
