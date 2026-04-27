import { GitPullRequest, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { LoginForm } from '@/components/login-form'
import { RepoList } from '@/components/repo-list'
import { UserMenu } from '@/components/user-menu'
import { api, type AuthStatus } from '@/lib/api'

type AppState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'authenticated'; status: AuthStatus }
  | { kind: 'error'; message: string }

function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' })

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
      <aside className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <GitPullRequest className="size-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">
            Prism
          </span>
        </div>

        <RepoList />
        <UserMenu user={user} onLogout={handleLogout} />
      </aside>

      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground/60">
          Selecione um repositório para ver os PRs.
        </p>
      </main>
    </div>
  )
}

export default App
