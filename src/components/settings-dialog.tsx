import {
  Bell,
  BellOff,
  Building2,
  Check,
  ExternalLink,
  GitFork,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Settings,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import {
  api,
  type NotificationMutes,
  type OrgRef,
  type WatchedRepo,
} from '@/lib/api'
import {
  PUSH_REASONS,
  iconForReason,
  labelForReason,
} from '@/lib/reasons'

type Props = {
  onChanged?: () => void
}

export function SettingsDialog({ onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [userOrgs, setUserOrgs] = useState<OrgRef[]>([])
  const [tracked, setTracked] = useState<string[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mutes, setMutes] = useState<NotificationMutes>({
    reasons: [],
    repos: [],
  })
  const [watched, setWatched] = useState<WatchedRepo[]>([])
  const [pauseUntil, setPauseUntil] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [orgs, trackedList, cid, m, w, pu] = await Promise.all([
        api.getUserOrgs().catch(() => []),
        api.getTrackedOrgs(),
        api.getOauthClientId(),
        api.listNotificationMutes(),
        api.getWatchedRepos(),
        api.getPauseStatus(),
      ])
      setUserOrgs(orgs)
      setTracked(trackedList)
      setClientId(cid)
      setMutes(m)
      setWatched(w)
      setPauseUntil(pu)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      load()
      setError(null)
      setName('')
    }
  }, [open])

  const trackedSet = new Set(tracked.map((t) => t.toLowerCase()))
  const userOrgLogins = new Set(userOrgs.map((o) => o.login.toLowerCase()))
  const customTracked = tracked.filter(
    (t) => !userOrgLogins.has(t.toLowerCase()),
  )

  async function toggleTrack(login: string) {
    setToggling(login)
    setError(null)
    try {
      if (trackedSet.has(login.toLowerCase())) {
        await api.removeTrackedOrg(login)
      } else {
        await api.addTrackedOrg(login)
      }
      await load()
      onChanged?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setToggling(null)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || adding) return
    setAdding(true)
    setError(null)
    try {
      await api.addTrackedOrg(name)
      setName('')
      await load()
      onChanged?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setAdding(false)
    }
  }

  const mutedReasons = useMemo(() => new Set(mutes.reasons), [mutes.reasons])
  const mutedRepos = useMemo(() => new Set(mutes.repos), [mutes.repos])
  const pauseRemainingMs = useMemo(() => {
    if (!pauseUntil) return 0
    const ms = pauseUntil * 1000 - Date.now()
    return ms > 0 ? ms : 0
  }, [pauseUntil])
  const isPaused = pauseRemainingMs > 0
  const pauseLabel = useMemo(() => {
    if (!isPaused) return null
    return new Date(pauseUntil! * 1000).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [pauseUntil, isPaused])

  async function toggleReasonMute(reason: string) {
    const wasMuted = mutedReasons.has(reason)
    await api.setNotificationMute('reason', reason, !wasMuted)
    setMutes((prev) => ({
      ...prev,
      reasons: wasMuted
        ? prev.reasons.filter((r) => r !== reason)
        : [...prev.reasons, reason],
    }))
  }

  async function toggleRepoMute(repoFull: string) {
    const wasMuted = mutedRepos.has(repoFull)
    await api.setNotificationMute('repo', repoFull, !wasMuted)
    setMutes((prev) => ({
      ...prev,
      repos: wasMuted
        ? prev.repos.filter((r) => r !== repoFull)
        : [...prev.repos, repoFull],
    }))
  }

  async function pauseFor(minutes: number) {
    await api.pauseNotifications(minutes)
    const pu = await api.getPauseStatus()
    setPauseUntil(pu)
  }

  async function resume() {
    await api.resumeNotifications()
    setPauseUntil(null)
  }

  function openManageAccess() {
    if (!clientId) return
    api.openUrl(
      `https://github.com/settings/connections/applications/${clientId}`,
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Configurações"
        >
          <Settings className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Notificações, organizações e repositórios.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {error && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
              {error}
            </p>
          )}

          {/* Notificações */}
          <section className="mb-6">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Bell className="size-4 text-muted-foreground" />
              Notificações
            </h3>

            <div className="mb-4 flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              {isPaused ? (
                <>
                  <PauseCircle className="size-4 shrink-0 text-primary" />
                  <span className="flex-1 text-xs">
                    Pausadas até{' '}
                    <span className="font-medium">{pauseLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={resume}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <PlayCircle className="size-3.5" />
                    Retomar
                  </button>
                </>
              ) : (
                <>
                  <Bell className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-xs text-muted-foreground">
                    Pausar por
                  </span>
                  <button
                    type="button"
                    onClick={() => pauseFor(60)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    1h
                  </button>
                  <button
                    type="button"
                    onClick={() => pauseFor(240)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    4h
                  </button>
                </>
              )}
            </div>

            <p className="mb-2 text-xs text-muted-foreground">
              Tipos de evento que disparam push nativo:
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {PUSH_REASONS.map((reason) => {
                const Icon = iconForReason(reason)
                const muted = mutedReasons.has(reason)
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => toggleReasonMute(reason)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      muted
                        ? 'border-dashed border-border text-muted-foreground/50 line-through hover:bg-accent'
                        : 'border-border bg-card hover:bg-accent'
                    }`}
                  >
                    <Icon className="size-3" />
                    {labelForReason(reason)}
                  </button>
                )
              })}
            </div>

            <p className="mb-2 text-xs text-muted-foreground">
              Repositórios silenciados:
            </p>
            <div className="flex flex-col gap-1">
              {watched.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                  Nenhum repositório observado.
                </p>
              )}
              {watched.map((repo) => {
                const muted = mutedRepos.has(repo.full_name)
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => toggleRepoMute(repo.full_name)}
                    className="group flex w-full items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <GitFork className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">
                      {repo.full_name}
                    </span>
                    {muted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <BellOff className="size-3" />
                        Silenciado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Bell className="size-3" />
                        Ativo
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Suas organizações */}
          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="size-4 text-muted-foreground" />
                Suas organizações
              </h3>
              <button
                type="button"
                onClick={openManageAccess}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Solicitar acesso
                <ExternalLink className="size-3" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Toggle para incluir os repos públicos delas na busca. Se uma org
              restringe apps de terceiros, use "Solicitar acesso".
            </p>

            <div className="flex flex-col gap-1">
              {loading && userOrgs.length === 0 && (
                <>
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </>
              )}

              {!loading && userOrgs.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                  Você não pertence a nenhuma organização.
                </p>
              )}

              {userOrgs.map((org) => {
                const isTracked = trackedSet.has(org.login.toLowerCase())
                const isToggling = toggling === org.login
                return (
                  <button
                    key={org.login}
                    type="button"
                    disabled={isToggling}
                    onClick={() => toggleTrack(org.login)}
                    className="group flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <Avatar className="size-7 shrink-0 rounded-md">
                      <AvatarImage src={org.avatar_url} alt={org.login} />
                      <AvatarFallback className="rounded-md bg-muted text-xs">
                        {org.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">
                        {org.login}
                      </p>
                      {org.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {org.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isToggling ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : isTracked ? (
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
          </section>

          {/* Adicionar outra org */}
          <section>
            <h3 className="mb-2 text-sm font-medium">Rastrear outra org</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Acompanhe repos públicos de orgs que você não pertence (ex:
              tauri-apps).
            </p>

            <form onSubmit={handleAdd} className="mb-3 flex gap-2">
              <Input
                type="text"
                placeholder="ex: tauri-apps"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={adding}
              />
              <Button type="submit" disabled={adding || !name.trim()}>
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </form>

            <div className="flex flex-col gap-1">
              {customTracked.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                  Nenhuma org externa adicionada.
                </p>
              ) : (
                customTracked.map((org) => (
                  <div
                    key={org}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm">{org}</span>
                    <button
                      type="button"
                      onClick={() => toggleTrack(org)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remover ${org}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
