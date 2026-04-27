import { Building2, Loader2, Plus, Settings, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

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
import { api } from '@/lib/api'

type Props = {
  onChanged?: () => void
}

export function SettingsDialog({ onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [orgs, setOrgs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setOrgs(await api.getTrackedOrgs())
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

  async function handleRemove(org: string) {
    await api.removeTrackedOrg(org)
    await load()
    onChanged?.()
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

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Gerencie organizações que você quer acompanhar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Building2 className="size-4 text-muted-foreground" />
              Organizações rastreadas
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Adicione orgs (mesmo as que você não pertence) para incluir os
              repos públicos delas na busca.
            </p>

            <form onSubmit={handleAdd} className="flex gap-2 mb-3">
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

            {error && (
              <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-1">
              {loading && (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              )}
              {!loading && orgs.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhuma organização rastreada.
                </p>
              )}
              {orgs.map((org) => (
                <div
                  key={org}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
                >
                  <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm">{org}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(org)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remover ${org}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
