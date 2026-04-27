import { Lock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Repo } from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: Repo[] }
  | { status: 'error'; message: string }

export function RepoList() {
  const [state, setState] = useState<State>({ status: 'loading' })

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-medium text-muted-foreground">
          Repositórios
          {state.status === 'ready' && (
            <span className="ml-2 text-xs">({state.repos.length})</span>
          )}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={load}
          disabled={state.status === 'loading'}
          aria-label="Atualizar"
        >
          <RefreshCw
            className={`size-4 ${state.status === 'loading' ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 flex flex-col gap-1">
          {state.status === 'loading' && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </>
          )}

          {state.status === 'error' && (
            <div className="p-3 text-sm text-destructive break-words">
              {state.message}
            </div>
          )}

          {state.status === 'ready' && state.repos.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              Nenhum repositório acessível com este token.
            </div>
          )}

          {state.status === 'ready' &&
            state.repos.map((repo) => <RepoItem key={repo.id} repo={repo} />)}
        </div>
      </ScrollArea>
    </div>
  )
}

function RepoItem({ repo }: { repo: Repo }) {
  return (
    <button
      type="button"
      className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
    >
      <div className="flex items-center gap-1.5 w-full">
        <span className="text-xs text-muted-foreground truncate">
          {repo.owner.login}/
        </span>
        <span className="text-sm font-medium truncate flex-1">{repo.name}</span>
        {repo.private && (
          <Lock className="size-3 text-muted-foreground shrink-0" />
        )}
      </div>
      {repo.description && (
        <span className="text-xs text-muted-foreground line-clamp-1">
          {repo.description}
        </span>
      )}
    </button>
  )
}
