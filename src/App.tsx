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
      <main className="min-h-svh flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="min-h-svh flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-destructive mb-2">{state.message}</p>
          <button
            className="text-sm underline"
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
    <div className="h-svh flex">
      <aside className="w-72 border-r flex flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <GitPullRequest className="size-5 text-primary" />
          <span className="font-semibold">Prism</span>
        </div>
        <RepoList />
        <UserMenu user={user} onLogout={handleLogout} />
      </aside>
      <main className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Selecione um repositório para ver os PRs.</p>
      </main>
    </div>
  )
}

export default App
