import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { Download, Loader2, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 1000 * 60 * 60 * 3
const DISMISSED_KEY = 'prism.update-dismissed-version'

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; received: number; total: number | null }
  | { kind: 'ready'; update: Update }
  | { kind: 'error'; message: string; previous: Update | null }

type Props = {
  collapsed: boolean
}

export function UpdatePill({ collapsed }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_KEY),
  )
  const checkingRef = useRef(false)

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      const update = await check()
      setPhase((prev) => {
        if (prev.kind === 'downloading' || prev.kind === 'ready') return prev
        return update ? { kind: 'available', update } : { kind: 'idle' }
      })
    } catch (err) {
      console.warn('update check failed', err)
    } finally {
      checkingRef.current = false
    }
  }, [])

  useEffect(() => {
    runCheck()
    const id = window.setInterval(runCheck, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [runCheck])

  async function startUpdate(update: Update) {
    setPhase({ kind: 'downloading', update, received: 0, total: null })
    try {
      let received = 0
      let total: number | null = null
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
          setPhase({ kind: 'downloading', update, received: 0, total })
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength
          setPhase({ kind: 'downloading', update, received, total })
        } else if (event.event === 'Finished') {
          setPhase({ kind: 'ready', update })
        }
      })
      await relaunch()
    } catch (err) {
      const previous =
        phase.kind === 'available' || phase.kind === 'downloading'
          ? phase.update
          : null
      setPhase({ kind: 'error', message: String(err), previous })
    }
  }

  function dismiss(version: string) {
    localStorage.setItem(DISMISSED_KEY, version)
    setDismissedVersion(version)
  }

  if (phase.kind === 'idle') return null

  const update =
    phase.kind === 'error'
      ? phase.previous
      : phase.kind === 'available' ||
          phase.kind === 'downloading' ||
          phase.kind === 'ready'
        ? phase.update
        : null

  if (!update) return null
  if (phase.kind === 'available' && dismissedVersion === update.version) return null

  const tooltip = `${update.version}${update.date ? ` · ${update.date}` : ''}`

  let Icon: typeof Download = Download
  let label = `Atualizar para ${update.version}`
  let busy = false
  let onClick: (() => void) | null = () => startUpdate(update)
  let dismissable = phase.kind === 'available' || phase.kind === 'error'

  if (phase.kind === 'downloading') {
    busy = true
    onClick = null
    dismissable = false
    if (phase.total) {
      const pct = Math.min(100, Math.floor((phase.received / phase.total) * 100))
      label = `Baixando (${pct}%)`
    } else {
      label = 'Baixando…'
    }
  } else if (phase.kind === 'ready') {
    Icon = RotateCw
    label = 'Reiniciar para atualizar'
    onClick = () => {
      relaunch().catch(() => {})
    }
    dismissable = false
  } else if (phase.kind === 'error') {
    label = 'Falha na atualização'
    onClick = () => startUpdate(update)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onClick?.()}
        disabled={busy}
        className="mx-2 mb-2 inline-flex h-8 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/25 disabled:cursor-wait disabled:opacity-70"
        title={`${label}\n${tooltip}`}
        aria-label={label}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </button>
    )
  }

  return (
    <div
      className="mx-2 mb-2 flex flex-col gap-1 rounded-md bg-primary/15 text-xs font-medium text-primary ring-1 ring-primary/25"
      title={tooltip}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onClick?.()}
          disabled={busy}
          className="flex flex-1 items-center gap-2 rounded-l-md px-2.5 py-1.5 transition-colors enabled:hover:bg-primary/10 disabled:cursor-wait"
        >
          {busy ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <Icon className="size-3.5 shrink-0" />
          )}
          <span className="flex-1 truncate text-left">{label}</span>
        </button>
        {dismissable && (
          <button
            type="button"
            onClick={() => dismiss(update.version)}
            className="mr-1 inline-flex size-5 items-center justify-center rounded-md text-primary/60 transition-colors hover:bg-primary/15 hover:text-primary"
            aria-label="Dispensar"
            title="Dispensar até a próxima versão"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {phase.kind === 'error' && (
        <p className="px-2.5 pb-1.5 text-[10px] font-normal text-destructive/80">
          {phase.message}
        </p>
      )}
    </div>
  )
}
