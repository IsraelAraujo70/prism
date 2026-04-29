import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  placeholder?: string
  contextLabel?: string
  submitLabel?: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

export function CommentEditor({
  placeholder = 'Escreva um comentário…',
  contextLabel,
  submitLabel = 'Comentar',
  autoFocus = true,
  onSubmit,
  onCancel,
}: Props) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      setBody('')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-card p-3 ring-1 ring-primary/20">
      {contextLabel && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {contextLabel}
        </p>
      )}
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={submitting}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-sans text-sm leading-snug text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />
      {error && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground/60">
          Markdown · Cmd/Ctrl+Enter pra enviar · Esc cancela
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-3 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
