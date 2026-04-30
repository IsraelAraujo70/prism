import { Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { CommandPalette } from '@/components/command-palette'
import { Dashboard } from '@/components/dashboard'
import { Inbox } from '@/components/inbox'
import { InboxSidebarLink } from '@/components/inbox-sidebar-link'
import { LoginForm } from '@/components/login-form'
import { PrViewer } from '@/components/pr-viewer'
import { RepoList } from '@/components/repo-list'
import { SearchSidebarLink } from '@/components/search-sidebar-link'
import { SettingsDialog } from '@/components/settings-dialog'
import { UpdatePill } from '@/components/update-pill'
import { UserMenu } from '@/components/user-menu'
import {
  api,
  type AuthStatus,
  type PullRequestRef,
  type WatchedRepo,
} from '@/lib/api'

const COLLAPSED_KEY = 'prism.sidebar-collapsed'

type AppState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'authenticated'; status: AuthStatus }
  | { kind: 'error'; message: string }

function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' })
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  )
  const [selectedRepo, setSelectedRepo] = useState<WatchedRepo | null>(null)
  const [selectedPr, setSelectedPr] = useState<PullRequestRef | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    api
      .getAuthStatus()
      .then((status) => {
        setState(
          status.authenticated && status.user
            ? { kind: 'authenticated', status }
            : { kind: 'unauthenticated' },
        )
      })
      .catch((err) => setState({ kind: 'error', message: String(err) }))
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  useEffect(() => {
    if (state.kind !== 'authenticated') return
    function onKeydown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        toggleCollapsed()
      } else if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [state.kind, toggleCollapsed])

  async function handleLogout() {
    try {
      await api.logout()
    } finally {
      setState({ kind: 'unauthenticated' })
    }
  }

  if (state.kind === 'loading') {
    return (
      <main className="min-h-svh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="min-h-svh flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="text-sm text-destructive mb-2">{state.message}</p>
          <button
            className="text-sm text-muted-foreground underline hover:text-foreground"
            onClick={() => setState({ kind: 'unauthenticated' })}
          >
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }

  if (state.kind === 'unauthenticated') {
    return (
      <LoginForm
        onAuthenticated={(status) => setState({ kind: 'authenticated', status })}
      />
    )
  }

  const user = state.status.user!
  return (
    <div className="flex h-svh bg-background">
      <aside
        style={{ width: collapsed ? 56 : 288 }}
        className="flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out"
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="group relative flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border transition-colors hover:bg-sidebar-accent/40"
            aria-label="Expandir sidebar"
            title="Expandir (Ctrl+B)"
          >
            <img
              src="/icon.png"
              alt="Prism"
              className="size-8 transition-opacity group-hover:opacity-0"
            />
            <PanelLeftOpen className="absolute size-5 text-sidebar-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3">
            <img src="/icon.png" alt="Prism" className="size-8 shrink-0" />
            <span className="flex-1 text-base font-semibold tracking-tight">
              Prism
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Minimizar sidebar"
              title="Minimizar (Ctrl+B)"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        )}

        <SearchSidebarLink
          collapsed={collapsed}
          onClick={() => setPaletteOpen(true)}
        />
        <InboxSidebarLink
          collapsed={collapsed}
          active={inboxOpen}
          onClick={() => {
            setInboxOpen(true)
            setSelectedPr(null)
          }}
        />
        <RepoList
          collapsed={collapsed}
          settingsSlot={<SettingsDialog />}
          selectedId={inboxOpen ? null : selectedRepo?.id ?? null}
          onSelectRepo={(repo) => {
            setSelectedRepo(repo)
            setSelectedPr(null)
            setInboxOpen(false)
          }}
          onRepoRemoved={(id) => {
            if (selectedRepo?.id === id) setSelectedRepo(null)
          }}
        />
        <UpdatePill collapsed={collapsed} />
        <UserMenu user={user} onLogout={handleLogout} collapsed={collapsed} />
      </aside>

      {selectedPr ? (
        <PrViewer pr={selectedPr} onBack={() => setSelectedPr(null)} />
      ) : inboxOpen ? (
        <Inbox onSelectPr={setSelectedPr} />
      ) : (
        <Dashboard
          repo={selectedRepo}
          onClear={() => setSelectedRepo(null)}
          onSelectPr={setSelectedPr}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelectRepo={(repo) => {
          setSelectedRepo(repo)
          setSelectedPr(null)
          setInboxOpen(false)
        }}
        onSelectPr={(pr) => {
          setSelectedPr(pr)
          setInboxOpen(false)
        }}
      />
    </div>
  )
}

export default App
