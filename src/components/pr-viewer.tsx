import {
  ArrowLeft,
  Check,
  CircleDashed,
  ExternalLink,
  FileText,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
  MessageCircleX,
  MessageSquare,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Markdown } from '@/components/markdown'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type CheckEntry,
  type PrAuthor,
  type PrDetails,
  type PullRequestRef,
  type TimelineEntry,
} from '@/lib/api'
import { formatAbsolute, formatRelative } from '@/lib/format'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: PrDetails }
  | { status: 'error'; message: string }

type Props = {
  pr: PullRequestRef
  onBack: () => void
}

export function PrViewer({ pr, onBack }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const [owner, name] = pr.repo.split('/')

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState({ status: 'loading' })
      setRefreshing(true)
      try {
        const data = await api.getPrDetails(owner, name, pr.number)
        setState({ status: 'ready', data })
      } catch (err) {
        setState({ status: 'error', message: String(err) })
      } finally {
        setRefreshing(false)
      }
    },
    [owner, name, pr.number],
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Voltar"
          title="Voltar"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="flex min-w-0 flex-col">
          <h1 className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight text-foreground">
            <span className="text-muted-foreground tabular-nums">
              #{pr.number}
            </span>
            <span className="truncate">{pr.title}</span>
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">{pr.repo}</p>
        </div>
        <button
          type="button"
          onClick={() => api.openUrl(pr.html_url)}
          className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Abrir no GitHub"
          title="Abrir no GitHub"
        >
          <ExternalLink className="size-3.5" />
        </button>
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
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {state.status === 'loading' && <PrViewerSkeleton />}

          {state.status === 'error' && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.message}
            </div>
          )}

          {state.status === 'ready' && <PrBody data={state.data} />}
        </div>
      </div>
    </div>
  )
}

function PrBody({ data }: { data: PrDetails }) {
  const status = resolveStatus(data)
  const reviewers = mergeReviewers(data)

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {data.author && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar className="size-4">
                <AvatarImage src={data.author.avatar_url} alt={data.author.login} />
                <AvatarFallback className="bg-muted text-[8px] font-semibold">
                  {data.author.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-foreground/80">{data.author.login}</span>
            </div>
          )}
          <span
            className="text-xs text-muted-foreground"
            title={formatAbsolute(data.created_at)}
          >
            abriu {formatRelative(data.created_at)} atrás
          </span>
          {data.merged_at && (
            <span
              className="text-xs text-muted-foreground"
              title={formatAbsolute(data.merged_at)}
            >
              · merged {formatRelative(data.merged_at)} atrás
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BranchChip label={data.head_ref} from />
          <span className="text-muted-foreground/60">→</span>
          <BranchChip label={data.base_ref} />
          <MergeableChip status={status} mergeable={data.mergeable} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={GitCommitHorizontal} label="Commits" value={data.commits_count.toString()} />
        <Stat icon={FileText} label="Files" value={data.changed_files.toString()} />
        <Stat label="Linhas adicionadas" value={`+${data.additions}`} accent="add" />
        <Stat label="Linhas removidas" value={`-${data.deletions}`} accent="del" />
      </section>

      {(data.labels.length > 0 || data.assignees.length > 0 || reviewers.length > 0) && (
        <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          {data.labels.length > 0 && (
            <MetaRow label="Labels">
              <div className="flex flex-wrap gap-1.5">
                {data.labels.map((l) => (
                  <LabelChip key={l.name} name={l.name} color={l.color} />
                ))}
              </div>
            </MetaRow>
          )}
          {reviewers.length > 0 && (
            <MetaRow label="Reviewers">
              <PeopleRow people={reviewers} />
            </MetaRow>
          )}
          {data.assignees.length > 0 && (
            <MetaRow label="Assignees">
              <PeopleRow people={data.assignees} />
            </MetaRow>
          )}
        </section>
      )}

      {(data.checks.length > 0 || data.checks_state) && (
        <ChecksSection checks={data.checks} rollupState={data.checks_state} />
      )}

      {data.body.trim().length > 0 && (
        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Descrição
          </h2>
          <Markdown>{data.body}</Markdown>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Atividade
          <span className="ml-1.5 tabular-nums text-muted-foreground/60">
            {data.timeline.length}
          </span>
        </h2>
        {data.timeline.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Sem comentários ou reviews.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.timeline.map((entry, i) => (
              <TimelineItem key={i} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

type StatusKind = 'open' | 'merged' | 'closed' | 'draft'

function resolveStatus(data: PrDetails): StatusKind {
  if (data.state === 'MERGED') return 'merged'
  if (data.state === 'CLOSED') return 'closed'
  if (data.is_draft) return 'draft'
  return 'open'
}

function StatusBadge({ status }: { status: StatusKind }) {
  const config: Record<
    StatusKind,
    { label: string; icon: LucideIcon; className: string }
  > = {
    open: {
      label: 'Aberto',
      icon: GitPullRequest,
      className: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
    },
    merged: {
      label: 'Merged',
      icon: GitMerge,
      className: 'bg-violet-500/15 text-violet-400 ring-violet-500/20',
    },
    closed: {
      label: 'Closed',
      icon: GitPullRequestClosed,
      className: 'bg-destructive/15 text-destructive ring-destructive/20',
    },
    draft: {
      label: 'Draft',
      icon: GitPullRequestDraft,
      className: 'bg-muted text-muted-foreground ring-border',
    },
  }
  const { label, icon: Icon, className } = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

function BranchChip({ label, from = false }: { label: string; from?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] ${
        from ? 'text-foreground' : 'text-muted-foreground'
      }`}
      title={label}
    >
      {label}
    </span>
  )
}

function MergeableChip({
  status,
  mergeable,
}: {
  status: StatusKind
  mergeable: string
}) {
  if (status !== 'open' && status !== 'draft') return null
  if (mergeable === 'CONFLICTING') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
        Conflitos
      </span>
    )
  }
  if (mergeable === 'MERGEABLE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
        Sem conflitos
      </span>
    )
  }
  return null
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon?: LucideIcon
  label: string
  value: string
  accent?: 'add' | 'del'
}) {
  const valueClass =
    accent === 'add'
      ? 'text-emerald-400'
      : accent === 'del'
        ? 'text-rose-400'
        : 'text-foreground'
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="size-3.5 text-muted-foreground/60" />}
      </div>
      <span
        className={`text-xl font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </span>
    </div>
  )
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function PeopleRow({ people }: { people: PrAuthor[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <div
          key={p.login}
          className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5"
          title={p.login}
        >
          <Avatar className="size-4">
            <AvatarImage src={p.avatar_url} alt={p.login} />
            <AvatarFallback className="bg-muted text-[8px] font-semibold">
              {p.login.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-foreground/80">{p.login}</span>
        </div>
      ))}
    </div>
  )
}

function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1"
      style={{
        backgroundColor: `#${color}20`,
        color: `#${color}`,
        boxShadow: `inset 0 0 0 1px #${color}40`,
      }}
    >
      {name}
    </span>
  )
}

function ChecksSection({
  checks,
  rollupState,
}: {
  checks: CheckEntry[]
  rollupState: string | null
}) {
  const summary = countByConclusion(checks)
  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Checks
          {checks.length > 0 && (
            <span className="tabular-nums text-muted-foreground/60">
              {checks.length}
            </span>
          )}
        </h2>
        <RollupBadge state={rollupState} summary={summary} />
      </header>
      {checks.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Sem detalhes de checks individuais.
        </p>
      ) : (
        <ul className="flex flex-col">
          {checks.map((c, i) => (
            <CheckItem key={`${c.name}-${i}`} check={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

type CheckTone = 'success' | 'failure' | 'pending' | 'neutral'

function checkTone(c: CheckEntry): CheckTone {
  if (c.status !== 'COMPLETED') return 'pending'
  switch (c.conclusion) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'ERROR':
    case 'TIMED_OUT':
    case 'CANCELLED':
    case 'ACTION_REQUIRED':
    case 'STARTUP_FAILURE':
      return 'failure'
    default:
      return 'neutral'
  }
}

function countByConclusion(checks: CheckEntry[]) {
  let success = 0
  let failure = 0
  let pending = 0
  let neutral = 0
  for (const c of checks) {
    const tone = checkTone(c)
    if (tone === 'success') success++
    else if (tone === 'failure') failure++
    else if (tone === 'pending') pending++
    else neutral++
  }
  return { success, failure, pending, neutral }
}

function RollupBadge({
  state,
  summary,
}: {
  state: string | null
  summary: { success: number; failure: number; pending: number; neutral: number }
}) {
  const total =
    summary.success + summary.failure + summary.pending + summary.neutral
  if (total === 0 && !state) return null

  if (summary.failure > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-400">
        <MessageCircleX className="size-3.5" />
        {summary.failure} falhando
      </span>
    )
  }
  if (summary.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {summary.pending} rodando
      </span>
    )
  }
  if (summary.success > 0 && summary.success === total) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <Check className="size-3.5" />
        Todos passando
      </span>
    )
  }
  if (state === 'SUCCESS') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <Check className="size-3.5" />
        Sucesso
      </span>
    )
  }
  if (state === 'FAILURE' || state === 'ERROR') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-400">
        <MessageCircleX className="size-3.5" />
        Falha
      </span>
    )
  }
  if (state === 'PENDING' || state === 'EXPECTED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Aguardando
      </span>
    )
  }
  return null
}

function CheckItem({ check }: { check: CheckEntry }) {
  const tone = checkTone(check)
  const toneIcon: Record<CheckTone, LucideIcon> = {
    success: Check,
    failure: MessageCircleX,
    pending: Loader2,
    neutral: CircleDashed,
  }
  const toneColor: Record<CheckTone, string> = {
    success: 'text-emerald-400',
    failure: 'text-rose-400',
    pending: 'text-muted-foreground',
    neutral: 'text-muted-foreground/70',
  }
  const Icon = toneIcon[tone]

  const duration = formatDuration(check.started_at, check.completed_at)
  const subtitle = [check.app_name, check.workflow_name, duration]
    .filter(Boolean)
    .join(' · ')

  const clickable = Boolean(check.url)
  const Wrapper: 'button' | 'div' = clickable ? 'button' : 'div'

  return (
    <li className="border-t border-border first:border-t-0">
      <Wrapper
        type={clickable ? 'button' : undefined}
        onClick={
          clickable && check.url
            ? () => api.openUrl(check.url as string)
            : undefined
        }
        className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left ${
          clickable ? 'transition-colors hover:bg-accent' : ''
        }`}
      >
        <Icon
          className={`size-4 shrink-0 ${toneColor[tone]} ${
            tone === 'pending' ? 'animate-spin' : ''
          }`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground/90">
            {check.name}
          </span>
          {subtitle && (
            <span className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
        {clickable && (
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
        )}
      </Wrapper>
    </li>
  )
}

function formatDuration(
  started: string | null,
  completed: string | null,
): string | null {
  if (!started || !completed) return null
  const a = new Date(started).getTime()
  const b = new Date(completed).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  const sec = Math.round((b - a) / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`
  const hr = Math.floor(min / 60)
  return `${hr}h ${min % 60}m`
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'comment') {
    return (
      <li className="rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          {entry.author && (
            <>
              <Avatar className="size-6">
                <AvatarImage
                  src={entry.author.avatar_url}
                  alt={entry.author.login}
                />
                <AvatarFallback className="bg-muted text-[9px] font-semibold">
                  {entry.author.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground">
                {entry.author.login}
              </span>
            </>
          )}
          <span className="text-xs text-muted-foreground">comentou</span>
          <span
            className="ml-auto text-xs text-muted-foreground/70"
            title={formatAbsolute(entry.created_at)}
          >
            {formatRelative(entry.created_at)}
          </span>
        </header>
        <div className="px-4 py-3">
          {entry.body.trim().length > 0 ? (
            <Markdown>{entry.body}</Markdown>
          ) : (
            <p className="text-sm italic text-muted-foreground">(sem texto)</p>
          )}
        </div>
      </li>
    )
  }

  const reviewConfig: Record<
    string,
    { label: string; className: string; icon: LucideIcon }
  > = {
    APPROVED: {
      label: 'aprovou',
      className: 'text-emerald-400',
      icon: Check,
    },
    CHANGES_REQUESTED: {
      label: 'pediu mudanças',
      className: 'text-rose-400',
      icon: MessageCircleX,
    },
    COMMENTED: {
      label: 'comentou na review',
      className: 'text-muted-foreground',
      icon: MessageSquare,
    },
    DISMISSED: {
      label: 'review descartada',
      className: 'text-muted-foreground',
      icon: CircleDashed,
    },
  }
  const cfg = reviewConfig[entry.state] ?? {
    label: entry.state.toLowerCase(),
    className: 'text-muted-foreground',
    icon: MessageSquare,
  }

  return (
    <li className="rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {entry.author && (
          <>
            <Avatar className="size-6">
              <AvatarImage
                src={entry.author.avatar_url}
                alt={entry.author.login}
              />
              <AvatarFallback className="bg-muted text-[9px] font-semibold">
                {entry.author.login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground">
              {entry.author.login}
            </span>
          </>
        )}
        <span className={`inline-flex items-center gap-1 text-xs ${cfg.className}`}>
          <cfg.icon className="size-3.5" />
          {cfg.label}
        </span>
        <span
          className="ml-auto text-xs text-muted-foreground/70"
          title={formatAbsolute(entry.submitted_at)}
        >
          {formatRelative(entry.submitted_at)}
        </span>
      </header>
      {entry.body.trim().length > 0 && (
        <div className="px-4 py-3">
          <Markdown>{entry.body}</Markdown>
        </div>
      )}
    </li>
  )
}

function PrViewerSkeleton() {
  return (
    <>
      <Skeleton className="h-8 w-32 rounded-full bg-card" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl bg-card" />
        ))}
      </div>
      <Skeleton className="h-[120px] rounded-xl bg-card" />
      <Skeleton className="h-[180px] rounded-xl bg-card" />
    </>
  )
}

function mergeReviewers(data: PrDetails): PrAuthor[] {
  const map = new Map<string, PrAuthor>()
  for (const r of data.review_requests) map.set(r.login, r)
  for (const t of data.timeline) {
    if (t.kind === 'review' && t.author) {
      map.set(t.author.login, t.author)
    }
  }
  return Array.from(map.values())
}
