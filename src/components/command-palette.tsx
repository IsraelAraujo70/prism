import { GitPullRequest, Lock, MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandShortcut,
} from '@/components/ui/command'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  api,
  type PullRequestRef,
  type WatchedRepo,
} from '@/lib/api'

type ParsedQuery = {
  repoTokens: string[]
  prTokens: string[]
  orgTokens: string[]
  freeTerm: string
}

const RESERVED_PREFIX_RE = /^(repos?|prs?|org):(.*)$/i
const HIGHLIGHT_PREFIX_RE = /^(repos?|prs?|org):/i

function parseQuery(raw: string): ParsedQuery {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const repoTokens: string[] = []
  const prTokens: string[] = []
  const orgTokens: string[] = []
  const freeTerms: string[] = []

  for (const tok of tokens) {
    const m = tok.match(RESERVED_PREFIX_RE)
    if (m) {
      const kind = m[1].toLowerCase()
      const value = m[2]
      if (kind.startsWith('repo')) {
        if (value) repoTokens.push(value)
      } else if (kind.startsWith('pr')) {
        if (value) prTokens.push(value)
      } else if (kind === 'org') {
        if (value) orgTokens.push(value)
      }
    } else {
      freeTerms.push(tok)
    }
  }

  return {
    repoTokens,
    prTokens,
    orgTokens,
    freeTerm: freeTerms.join(' '),
  }
}

function highlightQuery(value: string): ReactNode {
  const tokens = value.split(/(\s+)/)
  return (
    <>
      {tokens.map((tok, idx) => {
        if (!tok) return null
        if (/^\s+$/.test(tok)) return <span key={idx}>{tok}</span>
        const m = tok.match(HIGHLIGHT_PREFIX_RE)
        if (m) {
          const prefix = m[0]
          const rest = tok.slice(prefix.length)
          return (
            <span key={idx} className="rounded bg-blue-400/15 text-blue-400">
              <span>{prefix}</span>
              {rest && <span>{rest}</span>}
            </span>
          )
        }
        return <span key={idx}>{tok}</span>
      })}
    </>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectRepo: (repo: WatchedRepo) => void
  onSelectPr: (pr: PullRequestRef) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectRepo,
  onSelectPr,
}: Props) {
  const [input, setInput] = useState('')
  const [repos, setRepos] = useState<WatchedRepo[]>([])
  const [globalPrs, setGlobalPrs] = useState<PullRequestRef[]>([])
  const [globalPrsLoading, setGlobalPrsLoading] = useState(false)
  const [repoPrsByRepoId, setRepoPrsByRepoId] = useState<
    Record<number, PullRequestRef[]>
  >({})
  const [repoPrsLoading, setRepoPrsLoading] = useState(false)
  const globalReqIdRef = useRef(0)
  const repoPrsReqIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setInput('')
    setGlobalPrs([])
    setRepoPrsByRepoId({})
    api
      .getWatchedRepos()
      .then(setRepos)
      .catch(() => setRepos([]))
  }, [open])

  const parsed = useMemo(() => parseQuery(input), [input])

  const showRepos = parsed.prTokens.length === 0
  const showGlobalPrs =
    parsed.repoTokens.length === 0 &&
    (parsed.freeTerm.length > 0 || parsed.prTokens.length > 0)
  const showRepoPrs = parsed.repoTokens.length > 0

  const filteredRepos = useMemo(() => {
    if (!showRepos) return []
    if (parsed.repoTokens.length === 0 && !parsed.freeTerm) {
      return repos.slice(0, 8)
    }
    const needles = [
      ...parsed.repoTokens,
      ...(parsed.freeTerm ? [parsed.freeTerm] : []),
    ].map((s) => s.toLowerCase())
    return repos
      .filter((r) => {
        const haystack = `${r.full_name} ${r.name}`.toLowerCase()
        return needles.every((n) => haystack.includes(n))
      })
      .slice(0, 8)
  }, [repos, showRepos, parsed.repoTokens, parsed.freeTerm])

  const matchedRepos = useMemo<WatchedRepo[]>(() => {
    if (!showRepoPrs) return []
    const needles = parsed.repoTokens.map((s) => s.toLowerCase())
    return repos
      .filter((r) => {
        const haystack = `${r.full_name} ${r.name}`.toLowerCase()
        return needles.some((n) => haystack.includes(n))
      })
      .slice(0, 5)
  }, [repos, showRepoPrs, parsed.repoTokens])

  const matchedReposKey = matchedRepos.map((r) => r.id).join(',')

  const prQueryTerm = useMemo(
    () => [parsed.freeTerm, ...parsed.prTokens].filter(Boolean).join(' '),
    [parsed.freeTerm, parsed.prTokens],
  )

  useEffect(() => {
    if (!open) return
    if (!showGlobalPrs || prQueryTerm.length === 0) {
      setGlobalPrs([])
      setGlobalPrsLoading(false)
      return
    }

    const id = ++globalReqIdRef.current
    setGlobalPrsLoading(true)
    const handle = window.setTimeout(() => {
      api
        .searchPrs(prQueryTerm)
        .then((items) => {
          if (globalReqIdRef.current !== id) return
          setGlobalPrs(items)
          setGlobalPrsLoading(false)
        })
        .catch(() => {
          if (globalReqIdRef.current !== id) return
          setGlobalPrs([])
          setGlobalPrsLoading(false)
        })
    }, 250)

    return () => window.clearTimeout(handle)
  }, [open, showGlobalPrs, prQueryTerm])

  useEffect(() => {
    if (!open || matchedRepos.length === 0) {
      setRepoPrsByRepoId({})
      setRepoPrsLoading(false)
      return
    }

    const id = ++repoPrsReqIdRef.current
    setRepoPrsLoading(true)
    const handle = window.setTimeout(async () => {
      const results = await Promise.all(
        matchedRepos.map(async (r) => {
          try {
            const items = await api.searchPrsInRepo(
              r.owner_login,
              r.name,
              prQueryTerm,
            )
            return [r.id, items] as const
          } catch {
            return [r.id, [] as PullRequestRef[]] as const
          }
        }),
      )
      if (repoPrsReqIdRef.current !== id) return
      const next: Record<number, PullRequestRef[]> = {}
      for (const [rid, items] of results) {
        next[rid] = items
      }
      setRepoPrsByRepoId(next)
      setRepoPrsLoading(false)
    }, 250)

    return () => window.clearTimeout(handle)
    // matchedReposKey collapses matchedRepos identity to a stable string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matchedReposKey, prQueryTerm])

  function handleSelectRepo(repo: WatchedRepo) {
    onOpenChange(false)
    onSelectRepo(repo)
  }

  function handleSelectPr(pr: PullRequestRef) {
    onOpenChange(false)
    onSelectPr(pr)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        value={input}
        onValueChange={setInput}
        placeholder="Buscar repos e PRs… (use repo: ou pr: pra filtrar)"
        renderHighlight={highlightQuery}
      />
      <CommandList>
        <CommandEmpty>
          {globalPrsLoading || repoPrsLoading ? 'Buscando…' : 'Nada encontrado.'}
        </CommandEmpty>

        {showRepos && filteredRepos.length > 0 && (
          <CommandGroup heading="Repos">
            {filteredRepos.map((repo) => (
              <CommandItem
                key={`repo-${repo.id}`}
                value={`repo ${repo.full_name}`}
                onSelect={() => handleSelectRepo(repo)}
              >
                <Avatar className="size-5 rounded-sm">
                  <AvatarImage
                    src={repo.owner_avatar_url}
                    alt={repo.owner_login}
                  />
                  <AvatarFallback className="rounded-sm text-[10px]">
                    {repo.owner_login.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{repo.full_name}</span>
                {repo.private && (
                  <Lock className="size-3 shrink-0 text-muted-foreground" />
                )}
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showGlobalPrs && (
          <CommandGroup heading="Pull Requests">
            {globalPrsLoading && <CommandLoading>Buscando…</CommandLoading>}
            {!globalPrsLoading &&
              globalPrs.map((pr) => (
                <CommandItem
                  key={`pr-${pr.id}`}
                  value={`pr ${pr.repo}#${pr.number} ${pr.title}`}
                  onSelect={() => handleSelectPr(pr)}
                >
                  <PrIcon draft={pr.draft} />
                  <PrInfo pr={pr} />
                </CommandItem>
              ))}
          </CommandGroup>
        )}

        {showRepoPrs &&
          matchedRepos.map((repo) => {
            const repoPrs = repoPrsByRepoId[repo.id] ?? []
            return (
              <CommandGroup
                key={`repo-prs-${repo.id}`}
                heading={`PRs em ${repo.full_name}`}
              >
                {repoPrsLoading && <CommandLoading>Buscando…</CommandLoading>}
                {!repoPrsLoading && repoPrs.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    Nenhum PR encontrado.
                  </div>
                )}
                {!repoPrsLoading &&
                  repoPrs.map((pr) => (
                    <CommandItem
                      key={`repo-pr-${repo.id}-${pr.id}`}
                      value={`repo-pr ${pr.repo}#${pr.number} ${pr.title}`}
                      onSelect={() => handleSelectPr(pr)}
                    >
                      <PrIcon draft={pr.draft} />
                      <PrInfo pr={pr} />
                    </CommandItem>
                  ))}
              </CommandGroup>
            )
          })}
      </CommandList>
    </CommandDialog>
  )
}

function PrIcon({ draft }: { draft: boolean }) {
  return (
    <GitPullRequest
      className={
        draft
          ? 'size-4 shrink-0 text-muted-foreground'
          : 'size-4 shrink-0 text-emerald-500'
      }
    />
  )
}

function PrInfo({ pr }: { pr: PullRequestRef }) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{pr.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {pr.repo} #{pr.number} · {pr.author.login}
        </span>
      </div>
      {pr.comments > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3" />
          {pr.comments}
        </span>
      )}
    </>
  )
}
