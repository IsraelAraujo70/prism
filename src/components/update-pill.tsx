import { listen } from '@tauri-apps/api/event'
import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api, UPDATE_INFO_EVENT, type UpdateInfo } from '@/lib/api'

const DISMISSED_KEY = 'prism.update-dismissed-version'

type Props = {
  collapsed: boolean
}

export function UpdatePill({ collapsed }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_KEY),
  )

  useEffect(() => {
    let cancelled = false
    api.getUpdateInfo().then((value) => {
      if (!cancelled) setInfo(value)
    })
    const unlisten = listen<UpdateInfo>(UPDATE_INFO_EVENT, (event) => {
      setInfo(event.payload)
    })
    return () => {
      cancelled = true
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [])

  if (!info || !info.has_update) return null
  if (dismissedVersion === info.latest_version) return null

  const tooltip = `${info.current_version} → ${info.latest_version}`

  function dismiss(version: string) {
    localStorage.setItem(DISMISSED_KEY, version)
    setDismissedVersion(version)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => api.openUrl(info.html_url)}
        className="mx-2 mb-2 inline-flex h-8 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/25"
        title={`Atualização disponível: ${tooltip}`}
        aria-label="Atualização disponível"
      >
        <Download className="size-4" />
      </button>
    )
  }

  return (
    <div
      className="mx-2 mb-2 flex items-center gap-1 rounded-md bg-primary/15 text-xs font-medium text-primary ring-1 ring-primary/25"
      title={tooltip}
    >
      <button
        type="button"
        onClick={() => api.openUrl(info.html_url)}
        className="flex flex-1 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-primary/10 rounded-l-md"
      >
        <Download className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">
          Atualizar para {info.latest_version}
        </span>
      </button>
      <button
        type="button"
        onClick={() => dismiss(info.latest_version)}
        className="mr-1 inline-flex size-5 items-center justify-center rounded-md text-primary/60 transition-colors hover:bg-primary/15 hover:text-primary"
        aria-label="Dispensar"
        title="Dispensar até a próxima versão"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
