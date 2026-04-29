import {
  ArrowLeft,
  Check,
  ChevronDown,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CommentCard } from '@/components/comment-card'
import { DiffViewer } from '@/components/diff-viewer'
import { Markdown } from '@/components/markdown'
import { ReviewThreadCard } from '@/components/review-thread-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type CheckEntry,
  type PrAuthor,
  type PrDetails,
  type PrFile,
  type PullRequestRef,
  type TimelineEntry,
} from '@/lib/api'
import { extractDiffSnippet } from '@/lib/diff'
import { formatAbsolute, formatRelative } from '@/lib/format'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: PrDetails }
  | { status: 'error'; message: string }

type FilesState =
  | { status: 'loading' }
  | { status: 'ready'; files: PrFile[] }
  | { status: 'error'; message: string }

type Props = {
  pr: PullRequestRef
  onBack: () => void
}

type MergeMethod = 'MERGE' | 'SQUASH' | 'REBASE'
type Tab = 'conversation' | 'files'

export function PrViewer({ pr, onBack }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [filesState, setFilesState] = useState<FilesState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('conversation')

  const [owner, name] = pr.repo.split('/')

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setState({ status: 'loading' })
        setFilesState({ status: 'loading' })
      }
      setRefreshing(true)
      const detailsPromise = api
        .getPrDetails(owner, name, pr.number)
        .then((data) => setState({ status: 'ready', data }))
        .catch((err) => setState({ status: 'error', message: String(err) }))
      const filesPromise = api
        .getPrFiles(owner, name, pr.number)
        .then((files) => setFilesState({ status: 'ready', files }))
        .catch((err) =>
          setFilesState({ status: 'error', message: String(err) }),
        )
      await Promise.all([detailsPromise, filesPromise])
      setRefreshing(false)
    },
    [owner, name, pr.number],
  )

  useEffect(() => {
    load()
  }, [load])

  const doMerge = useCallback(
    async (nodeId: string, method: MergeMethod) => {
      setMergeError(null)
      setMerging(true)
      try {
        await api.mergePullRequest(nodeId, method)
        await load(true)
      } catch (err) {
        setMergeError(String(err))
      } finally {
        setMerging(false)
      }
    },
    [load],
  )

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

      {state.status === 'ready' && (
        <TabsNav
          current={tab}
          onChange={setTab}
          timelineCount={state.data.timeline.length}
          filesCount={state.data.changed_files}
        />
      )}

      {state.status === 'loading' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <PrViewerSkeleton />
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.message}
            </div>
          </div>
        </div>
      )}

      {state.status === 'ready' && tab === 'conversation' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <ConversationContent
              data={state.data}
              files={
                filesState.status === 'ready' ? filesState.files : null
              }
              merging={merging}
              mergeError={mergeError}
              onMerge={(method) => doMerge(state.data.node_id, method)}
              onAfterMutation={() => load(true)}
            />
          </div>
        </div>
      )}

      {state.status === 'ready' && tab === 'files' && (
        <FilesPane
          prKey={`${pr.repo}#${pr.number}`}
          filesState={filesState}
          additions={state.data.additions}
          deletions={state.data.deletions}
          threads={state.data.timeline.filter(
            (t): t is Extract<TimelineEntry, { kind: 'review_thread' }> =>
              t.kind === 'review_thread',
          )}
          onAfterMutation={() => load(true)}
        />
      )}
    </div>
  )
}

function ConversationContent({
  data,
  files,
  merging,
  mergeError,
  onMerge,
  onAfterMutation,
}: {
  data: PrDetails
  files: PrFile[] | null
  merging: boolean
  mergeError: string | null
  onMerge: (method: MergeMethod) => void
  onAfterMutation: () => Promise<void>
}) {
  const status = resolveStatus(data)
  const reviewers = mergeReviewers(data)
  const canMerge =
    status === 'open' && data.mergeable === 'MERGEABLE' && !data.is_draft
  const patchByPath = useMemo(() => {
    const map = new Map<string, string>()
    if (files) {
      for (const f of files) {
        if (f.patch) map.set(f.filename, f.patch)
      }
    }
    return map
  }, [files])

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

      {(data.labels.length > 0 ||
        data.assignees.length > 0 ||
        reviewers.length > 0) && (
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

      {status === 'open' && (
        <MergeSection
          canMerge={canMerge}
          mergeable={data.mergeable}
          isDraft={data.is_draft}
          merging={merging}
          mergeError={mergeError}
          onMerge={onMerge}
        />
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
              <TimelineItem
                key={i}
                entry={entry}
                patchByPath={patchByPath}
                onAfterMutation={onAfterMutation}
              />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

function TabsNav({
  current,
  onChange,
  timelineCount,
  filesCount,
}: {
  current: Tab
  onChange: (t: Tab) => void
  timelineCount: number
  filesCount: number
}) {
  const items: { key: Tab; label: string; count: number }[] = [
    { key: 'conversation', label: 'Conversa', count: timelineCount },
    { key: 'files', label: 'Arquivos', count: filesCount },
  ]
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-6">
      {items.map((it) => {
        const active = current === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {it.label}
            <span className="tabular-nums text-muted-foreground/60">
              {it.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FilesPane({
  prKey,
  filesState,
  additions,
  deletions,
  threads,
  onAfterMutation,
}: {
  prKey: string
  filesState: FilesState
  additions: number
  deletions: number
  threads: Extract<TimelineEntry, { kind: 'review_thread' }>[]
  onAfterMutation: () => Promise<void>
}) {
  if (filesState.status === 'loading') {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Skeleton className="h-[300px] rounded-xl bg-card" />
      </div>
    )
  }
  if (filesState.status === 'error') {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-xs text-destructive">
          Não foi possível carregar os arquivos: {filesState.message}
        </div>
      </div>
    )
  }
  return (
    <DiffViewer
      prKey={prKey}
      files={filesState.files}
      additions={additions}
      deletions={deletions}
      threads={threads}
      onAfterMutation={onAfterMutation}
    />
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

function MergeSection({
  canMerge,
  mergeable,
  isDraft,
  merging,
  mergeError,
  onMerge,
}: {
  canMerge: boolean
  mergeable: string
  isDraft: boolean
  merging: boolean
  mergeError: string | null
  onMerge: (method: MergeMethod) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  let blockReason: string | null = null
  if (isDraft) blockReason = 'PR está como Draft. Marque como Ready for review primeiro.'
  else if (mergeable === 'CONFLICTING')
    blockReason = 'Existem conflitos com a branch base. Resolva antes de mergear.'
  else if (mergeable === 'UNKNOWN')
    blockReason = 'GitHub ainda calculando se é mergeable. Tente atualizar.'

  const methods: { key: MergeMethod; label: string; hint: string }[] = [
    { key: 'MERGE', label: 'Create a merge commit', hint: 'Mantém os commits + um merge commit' },
    { key: 'SQUASH', label: 'Squash and merge', hint: 'Combina todos commits em um' },
    { key: 'REBASE', label: 'Rebase and merge', hint: 'Aplica os commits sem merge commit' },
  ]

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <GitMerge
          className={`size-4 shrink-0 ${canMerge ? 'text-emerald-400' : 'text-muted-foreground'}`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-foreground">
            {canMerge ? 'Pronto pra mergear' : 'Não pode mergear ainda'}
          </span>
          {blockReason && (
            <span className="text-xs text-muted-foreground">{blockReason}</span>
          )}
        </div>
        {canMerge && (
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={merging}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {merging ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Mergeando…
                </>
              ) : (
                <>
                  <GitMerge className="size-3.5" />
                  Merge
                  <ChevronDown className="size-3" />
                </>
              )}
            </button>
            {open && !merging && (
              <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-md border border-border bg-popover p-1 shadow-md">
                {methods.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onMerge(m.key)
                    }}
                    className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="text-sm text-foreground">{m.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.hint}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {mergeError && (
        <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {mergeError}
        </div>
      )}
    </section>
  )
}

const REVIEW_ACTION: Record<
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

function TimelineItem({
  entry,
  patchByPath,
  onAfterMutation,
}: {
  entry: TimelineEntry
  patchByPath: Map<string, string>
  onAfterMutation: () => Promise<void>
}) {
  if (entry.kind === 'review_thread') {
    const patch = patchByPath.get(entry.path)
    const snippet =
      patch && entry.line != null
        ? extractDiffSnippet(patch, entry.line)
        : null
    return (
      <ReviewThreadCard
        thread={entry}
        snippet={snippet}
        onReply={async (body) => {
          await api.addReviewThreadReply(entry.id, body)
          await onAfterMutation()
        }}
        onResolveToggle={async () => {
          if (entry.is_resolved) await api.unresolveReviewThread(entry.id)
          else await api.resolveReviewThread(entry.id)
          await onAfterMutation()
        }}
      />
    )
  }
  if (entry.kind === 'comment') {
    return (
      <CommentCard
        author={entry.author}
        createdAt={entry.created_at}
        body={entry.body}
        action={{ label: 'comentou' }}
        placeholderForEmpty
      />
    )
  }
  const cfg =
    REVIEW_ACTION[entry.state] ?? {
      label: entry.state.toLowerCase(),
      className: 'text-muted-foreground',
      icon: MessageSquare,
    }
  return (
    <CommentCard
      author={entry.author}
      createdAt={entry.submitted_at}
      body={entry.body}
      action={cfg}
    />
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
