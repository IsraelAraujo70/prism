import {
  CircleDot,
  Clock,
  GitMerge,
  GitPullRequestClosed,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type PullRequestRef,
  type RepoPrScope,
  type WatchedRepo,
} from '@/lib/api'
import { formatRelative } from '@/lib/format'

type State =
  | { status: 'loading' }
  | {
      status: 'ready'
      items: PullRequestRef[]
      total: number
      nextCursor: string | null
    }
  | { status: 'error'; message: string }

const SCOPES: { value: RepoPrScope; label: string }[] = [
  { value: 'open', label: 'Abertos' },
  { value: 'closed', label: 'Fechados' },
  { value: 'all', label: 'Todos' },
]

type Props = {
  repo: WatchedRepo
  onSelectPr?: (pr: PullRequestRef) => void
}

export function RepoPrList({ repo, onSelectPr }: Props) {
  const [scope, setScope] = useState<RepoPrScope>('open')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const reqId = useRef(0)

  const [owner, name] = repo.full_name.split('/')

  const load = useCallback(
    async (nextScope: RepoPrScope) => {
      const id = ++reqId.current
      setState({ status: 'loading' })
      try {
        const page = await api.listRepoPrs(owner, name, nextScope)
        if (id !== reqId.current) return
        setState({
          status: 'ready',
          items: page.items,
          total: page.total,
          nextCursor: page.next_cursor,
        })
      } catch (err) {
        if (id !== reqId.current) return
        setState({ status: 'error', message: String(err) })
      }
    },
    [owner, name],
  )

  useEffect(() => {
    load(scope)
  }, [load, scope])

  async function loadMore() {
    if (state.status !== 'ready' || !state.nextCursor || loadingMore) return
    setLoadingMore(true)
    const id = reqId.current
    try {
      const page = await api.listRepoPrs(owner, name, scope, state.nextCursor)
      if (id !== reqId.current) return
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              items: [...prev.items, ...page.items],
              total: page.total,
              nextCursor: page.next_cursor,
            }
          : prev,
      )
    } catch (err) {
      if (id !== reqId.current) return
      setState({ status: 'error', message: String(err) })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Card size="sm" className="gap-0">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          Pull requests do repositório
          {state.status === 'ready' && (
            <Badge
              variant="secondary"
              className="rounded-full px-1.5 py-0 text-[10px] tabular-nums"
            >
              {state.total}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                scope === s.value
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {state.status === 'loading' && (
          <div className="flex flex-col gap-px p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md bg-muted/50" />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <p className="m-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {state.message}
          </p>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <p className="m-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhum PR neste filtro.
          </p>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <>
            <ul className="flex flex-col">
              {state.items.map((item, i) => (
                <li
                  key={item.id}
                  className={i > 0 ? 'border-t border-border' : ''}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPr ? onSelectPr(item) : api.openUrl(item.html_url)
                    }
                    className="group flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <PrStateIcon state={item.state} draft={item.draft} />
                    <Avatar className="size-6 shrink-0 mt-0.5">
                      <AvatarImage
                        src={item.author.avatar_url}
                        alt={item.author.login}
                      />
                      <AvatarFallback className="bg-muted text-[9px] font-semibold">
                        {item.author.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-foreground/90 group-hover:text-foreground">
                          {item.title}
                        </span>
                        {item.draft && (
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1.5 py-0 text-[9px] uppercase tracking-wider"
                          >
                            Draft
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums opacity-70">
                          #{item.number}
                        </span>
                        <span className="shrink-0">·</span>
                        <span className="truncate">{item.author.login}</span>
                        <span className="shrink-0">·</span>
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelative(item.updated_at)}
                        </span>
                        {item.comments > 0 && (
                          <>
                            <span className="shrink-0">·</span>
                            <span className="inline-flex shrink-0 items-center gap-1">
                              <MessageSquare className="size-3" />
                              {item.comments}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {state.nextCursor && (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Carregando…
                    </>
                  ) : (
                    'Carregar mais'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PrStateIcon({
  state,
  draft,
}: {
  state: string | undefined
  draft: boolean
}) {
  const cls = 'size-4 shrink-0 mt-1'
  if (state === 'MERGED') {
    return <GitMerge className={`${cls} text-purple-400`} />
  }
  if (state === 'CLOSED') {
    return <GitPullRequestClosed className={`${cls} text-destructive`} />
  }
  return (
    <CircleDot
      className={`${cls} ${draft ? 'text-muted-foreground' : 'text-emerald-400'}`}
    />
  )
}
