import { ExternalLink, GitPullRequest, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type AuthStatus } from '@/lib/api'

const PAT_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:org&description=Prism'

type Props = {
  onAuthenticated: (status: AuthStatus) => void
}

export function LoginForm({ onAuthenticated }: Props) {
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const status = await api.saveToken(token)
      onAuthenticated(status)
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitPullRequest className="size-6 text-primary" />
            <CardTitle className="text-2xl">Prism</CardTitle>
          </div>
          <CardDescription>
            Conecte sua conta do GitHub usando um Personal Access Token. O token
            fica salvo no keychain do sistema.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <Input
              type="password"
              placeholder="ghp_..."
              autoComplete="off"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={submitting}
            />
            {error && (
              <p className="text-sm text-destructive break-words">{error}</p>
            )}
            <a
              href={PAT_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              Criar um token no GitHub
              <ExternalLink className="size-3.5" />
            </a>
            <p className="text-xs text-muted-foreground">
              Escopos necessários: <code>repo</code> e <code>read:org</code>.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !token.trim()}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
