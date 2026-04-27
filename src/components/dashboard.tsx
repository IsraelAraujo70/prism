import {
  ArrowLeft,
  Clock,
  ExternalLink,
  GitFork,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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
  type ContributorStat,
  type Dashboard as DashboardData,
  type PullRequestRef,
  type WatchedRepo,
} from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: DashboardData }
  | { status: 'error'; message: string }

type Props = {
  repo?: WatchedRepo | null
  onClear?: () => void
}

export function Dashboard({ repo, onClear }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const fullName = repo?.full_name ?? null

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState({ status: 'loading' })
      setRefreshing(true)
      try {
        const data = await api.getDashboard(fullName)
        setState({ status: 'ready', data })
      } catch (err) {
        setState({ status: 'error', message: String(err) })
      } finally {
        setRefreshing(false)
      }
    },
    [fullName],
  )

  useEffect(() => {
    load()
  }, [load])

  const noWatched =
    !repo &&
    state.status === 'ready' &&
    state.data.stats.open_prs === 0 &&
    state.data.awaiting_your_review.length === 0 &&
    state.data.your_open_prs.length === 0 &&
    state.data.contributors.length === 0 &&
    state.data.stats.merged_30d === 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        {repo ? (
          <>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Voltar para visão geral"
              title="Voltar para visão geral"
            >
              <ArrowLeft className="size-3.5" />
            </button>
            <div className="flex min-w-0 flex-col">
              <h1 className="flex items-center gap-2 truncate text-sm font-semibold tracking-tight text-foreground">
                <GitFork className="size-3.5 shrink-0 text-muted-foreground" />
                {repo.name}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                {repo.full_name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => api.openUrl(repo.html_url)}
              className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Abrir no GitHub"
              title="Abrir no GitHub"
            >
              <ExternalLink className="size-3.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Visão geral
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Atividade dos repositórios que você acompanha
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Atualizar"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
          />
          Atualizar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          {state.status === 'loading' && <DashboardSkeleton />}

          {state.status === 'error' && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.message}
            </div>
          )}

          {state.status === 'ready' && noWatched && <EmptyState />}

          {state.status === 'ready' && !noWatched && (
            <DashboardContent data={state.data} />
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardContent({ data }: { data: DashboardData }) {
  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GitPullRequest}
          label="PRs abertos"
          value={data.stats.open_prs.toString()}
          hint="Em repos observados"
        />
        <StatCard
          icon={GitMerge}
          label="Merged (30d)"
          value={data.stats.merged_30d.toString()}
          hint="Últimos 30 dias"
          accent
        />
        <StatCard
          icon={MessageSquare}
          label="Aguardando você"
          value={data.stats.awaiting_count.toString()}
          hint="Reviews pendentes"
        />
        <StatCard
          icon={Users}
          label="Contribuidores"
          value={data.stats.contributors_count.toString()}
          hint="Últimos 90 dias"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NotificationList
          title="Aguardando sua review"
          count={data.awaiting_your_review.length}
          items={data.awaiting_your_review}
          emptyHint="Tudo em dia. Nenhum PR esperando você."
        />
        <NotificationList
          title="Seus PRs em revisão"
          count={data.your_open_prs.length}
          items={data.your_open_prs}
          emptyHint="Você não tem PRs abertos no momento."
        />
      </section>

      <section>
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <CardTitle className="text-sm">Contribuidores ativos</CardTitle>
            <span className="text-xs text-muted-foreground">
              Últimos 90 dias
            </span>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-1">
            {data.contributors.length === 0 ? (
              <p className="w-full rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                Nenhum PR mergeado nos últimos 90 dias.
              </p>
            ) : (
              data.contributors.map((c) => <ContributorChip key={c.login} c={c} />)
            )}
          </CardContent>
        </Card>
      </section>
    </>
  )
}

function ContributorChip({ c }: { c: ContributorStat }) {
  return (
    <div
      className="group flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 transition-colors hover:bg-accent"
      title={`${c.login} — ${c.prs} PRs`}
    >
      <Avatar className="size-5">
        <AvatarImage src={c.avatar_url} alt={c.login} />
        <AvatarFallback className="bg-muted text-[9px] font-semibold">
          {c.login.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs text-foreground/80 group-hover:text-foreground">
        {c.login}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {c.prs}
      </span>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  accent?: boolean
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon
            className={`size-3.5 ${accent ? 'text-primary' : 'text-muted-foreground/60'}`}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {value}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  )
}

function NotificationList({
  title,
  count,
  items,
  emptyHint,
}: {
  title: string
  count: number
  items: PullRequestRef[]
  emptyHint: string
}) {
  return (
    <Card size="sm" className="gap-0">
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          {title}
          {count > 0 && (
            <Badge
              variant="secondary"
              className="rounded-full px-1.5 py-0 text-[10px] tabular-nums"
            >
              {count}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="m-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyHint}
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item, i) => (
              <li
                key={item.id}
                className={i > 0 ? 'border-t border-border' : ''}
              >
                <button
                  type="button"
                  onClick={() => api.openUrl(item.html_url)}
                  className="group flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
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
                      <span className="truncate">
                        {item.repo}
                        <span className="ml-1 tabular-nums opacity-70">
                          #{item.number}
                        </span>
                      </span>
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
        )}
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl bg-card" />
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[200px] rounded-xl bg-card" />
        <Skeleton className="h-[200px] rounded-xl bg-card" />
      </section>
      <section>
        <Skeleton className="h-[120px] rounded-xl bg-card" />
      </section>
    </>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <GitFork className="size-10 text-muted-foreground/30" />
      <h2 className="text-base font-medium text-foreground">
        Nenhum repositório observado
      </h2>
      <p className="text-sm text-muted-foreground">
        Adicione repositórios na sidebar para ver PRs abertos, reviews
        pendentes e atividade da sua equipe aqui.
      </p>
    </div>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const sec = Math.max(1, Math.floor(diffMs / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}
