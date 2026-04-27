import { GitFork, Lock, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { AddRepoDialog } from '@/components/add-repo-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type WatchedRepo } from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: WatchedRepo[] }
  | { status: 'error'; message: string }

export function RepoList() {
  const [state, setState] = useState<State>({ status: 'loading' })

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

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        <div className="flex flex-col gap-0.5">
          {state.status === 'loading' &&
            Array.from({ length: 4 }).map((_, i) => (
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

          {state.status === 'ready' &&
            state.repos.map((repo) => (
              <WatchedRepoItem
                key={repo.id}
                repo={repo}
                onRemove={() => removeRepo(repo.id)}
              />
            ))}
        </div>
      </nav>
    </>
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
    <div className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-sidebar-accent">
      <button type="button" className="flex flex-1 items-center gap-2.5 min-w-0">
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
