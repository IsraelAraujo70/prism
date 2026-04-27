import { Check, Copy, GitPullRequest, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api, type AuthStatus, type DeviceCodeResponse } from '@/lib/api'

type Props = {
  onAuthenticated: (status: AuthStatus) => void
}

type FlowState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'waiting'; code: DeviceCodeResponse }
  | { step: 'error'; message: string }

export function LoginForm({ onAuthenticated }: Props) {
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intervalRef = useRef(5)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  async function startFlow() {
    setState({ step: 'starting' })
    try {
      const code = await api.startDeviceFlow()
      intervalRef.current = code.interval
      setState({ step: 'waiting', code })
      startPolling(code.device_code)
    } catch (err) {
      setState({ step: 'error', message: String(err) })
    }
  }

  function startPolling(deviceCode: string) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.pollDeviceFlow(deviceCode)
        switch (result.status) {
          case 'success':
            stopPolling()
            onAuthenticated({ authenticated: true, user: result.user })
            break
          case 'slow_down':
            intervalRef.current = result.interval
            stopPolling()
            pollRef.current = setInterval(
              () => pollOnce(deviceCode),
              intervalRef.current * 1000,
            )
            break
          case 'expired':
            stopPolling()
            setState({ step: 'error', message: 'Código expirou. Tente novamente.' })
            break
          case 'denied':
            stopPolling()
            setState({ step: 'error', message: 'Autorização negada.' })
            break
          case 'pending':
            break
        }
      } catch (err) {
        stopPolling()
        setState({ step: 'error', message: String(err) })
      }
    }, intervalRef.current * 1000)
  }

  async function pollOnce(deviceCode: string) {
    try {
      const result = await api.pollDeviceFlow(deviceCode)
      if (result.status === 'success') {
        stopPolling()
        onAuthenticated({ authenticated: true, user: result.user })
      }
    } catch {
      // ignore single poll failure
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <GitPullRequest className="size-7 text-primary" />
            <CardTitle className="text-3xl">Prism</CardTitle>
          </div>
          <CardDescription>
            Cliente desktop para Pull Requests do GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.step === 'idle' && (
            <Button size="lg" className="w-full" onClick={startFlow}>
              Entrar com GitHub
            </Button>
          )}

          {state.step === 'starting' && (
            <Button size="lg" className="w-full" disabled>
              <Loader2 className="size-4 animate-spin" />
              Conectando...
            </Button>
          )}

          {state.step === 'waiting' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground text-center">
                Um navegador foi aberto. Cole o código abaixo para autorizar:
              </p>
              <button
                type="button"
                onClick={() => copyCode(state.code.user_code)}
                className="flex items-center gap-3 px-6 py-3 rounded-lg bg-secondary text-2xl font-mono font-bold tracking-widest hover:bg-secondary/80 transition-colors"
              >
                {state.code.user_code}
                {copied ? (
                  <Check className="size-5 text-green-400" />
                ) : (
                  <Copy className="size-5 text-muted-foreground" />
                )}
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Aguardando autorização...
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopPolling()
                  setState({ step: 'idle' })
                }}
              >
                Cancelar
              </Button>
            </div>
          )}

          {state.step === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-destructive text-center break-words">
                {state.message}
              </p>
              <Button variant="outline" onClick={startFlow}>
                Tentar novamente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
