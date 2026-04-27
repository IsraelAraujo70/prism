import { Check, GitFork, Loader2, Lock, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Repo, type WatchedRepo } from '@/lib/api'

type Props = {
  watchedIds: Set<number>
  onChanged: () => void
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; repos: Repo[] }
  | { status: 'error'; message: string }

export function AddRepoDialog({ watchedIds, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<FetchState>({ status: 'idle' })
  const [filter, setFilter] = useState('')
  const [toggling, setToggling] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    if (state.status !== 'idle') return
    setState({ status: 'loading' })
    api
      .listAllRepos()
      .then((repos) => setState({ status: 'ready', repos }))
      .catch((err) => setState({ status: 'error', message: String(err) }))
  }, [open, state.status])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setState({ status: 'idle' })
      setFilter('')
    }
  }

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

  async function toggle(repo: Repo) {
    const isWatched = watchedIds.has(repo.id)
    setToggling((prev) => new Set(prev).add(repo.id))
    try {
      if (isWatched) {
        await api.removeWatchedRepo(repo.id)
      } else {
        const watched: WatchedRepo = {
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          html_url: repo.html_url,
          owner_login: repo.owner.login,
          owner_avatar_url: repo.owner.avatar_url,
        }
        await api.addWatchedRepo(watched)
      }
      onChanged()
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(repo.id)
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Adicionar repositório"
        >
          <Plus className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Adicionar repositórios</DialogTitle>
          <DialogDescription>
            Selecione quais repos você quer acompanhar.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por nome ou descrição..."
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t px-2 py-2">
          {state.status === 'loading' && (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          )}

          {state.status === 'error' && (
            <div className="p-4 text-center text-sm text-destructive">
              {state.message}
            </div>
          )}

          {state.status === 'ready' && filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhum repositório encontrado.
            </p>
          )}

          {state.status === 'ready' &&
            filtered.map((repo) => {
              const isWatched = watchedIds.has(repo.id)
              const isToggling = toggling.has(repo.id)
              return (
                <button
                  key={repo.id}
                  type="button"
                  disabled={isToggling}
                  onClick={() => toggle(repo)}
                  className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <GitFork className="size-4 shrink-0 text-muted-foreground/50" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {repo.owner.login}/
                      </span>
                      <span className="truncate text-sm font-medium">
                        {repo.name}
                      </span>
                      {repo.private && (
                        <Lock className="size-3 shrink-0 text-muted-foreground/40" />
                      )}
                    </div>
                    {repo.description && (
                      <p className="truncate text-xs text-muted-foreground/60">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isToggling ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : isWatched ? (
                      <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </div>
                    ) : (
                      <div className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        <Plus className="size-3.5" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
        </div>

        <div className="border-t px-5 py-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
