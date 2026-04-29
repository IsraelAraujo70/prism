import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  ExternalLink,
  FileDiff,
  FileMinus,
  FilePen,
  FilePlus,
  FileSymlink,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  WrapText,
  type LucideIcon,
} from 'lucide-react'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { CommentEditor } from '@/components/comment-editor'
import { HighlightedText } from '@/components/highlighted-text'
import {
  ReviewThreadCard,
  type ReviewThread,
} from '@/components/review-thread-card'
import { api, type PrFile, type ReviewSide } from '@/lib/api'
import {
  parseDiff,
  type DiffLine,
  type Hunk,
} from '@/lib/diff'
import {
  getLanguageFromFilename,
  useHighlightLine,
  type HighlightLineFn,
} from '@/lib/highlight'

type ViewMode = 'unified' | 'split'

type Props = {
  prKey: string
  prNodeId: string
  pendingReviewId: string | null
  files: PrFile[]
  additions: number
  deletions: number
  threads: ReviewThread[]
  onAfterMutation: () => Promise<void>
}

type Selection = {
  file: string
  side: ReviewSide
  anchorLine: number
  endLine: number
}

type LineAddr = { side: ReviewSide; lineNo: number }

export type RowSelectionApi = {
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
}

export type AddCommentArgs = {
  file: string
  side: ReviewSide
  line: number
  startLine: number | null
  startSide: ReviewSide | null
  body: string
}

export function lineAddrUnified(line: DiffLine): LineAddr | null {
  if (line.kind === 'del') {
    return line.old != null ? { side: 'LEFT', lineNo: line.old } : null
  }
  return line.new != null ? { side: 'RIGHT', lineNo: line.new } : null
}

export function lineAddrSplit(
  line: DiffLine,
  displaySide: 'left' | 'right',
): LineAddr | null {
  if (displaySide === 'left') {
    if (line.kind === 'add') return null
    return line.old != null ? { side: 'LEFT', lineNo: line.old } : null
  }
  if (line.kind === 'del') return null
  return line.new != null ? { side: 'RIGHT', lineNo: line.new } : null
}

function isAddrInSelection(
  file: string,
  addr: LineAddr | null,
  sel: Selection | null,
): boolean {
  if (!sel || !addr) return false
  if (sel.file !== file) return false
  if (sel.side !== addr.side) return false
  const min = Math.min(sel.anchorLine, sel.endLine)
  const max = Math.max(sel.anchorLine, sel.endLine)
  return addr.lineNo >= min && addr.lineNo <= max
}

function isAddrAtSelectionEnd(
  file: string,
  addr: LineAddr | null,
  sel: Selection | null,
): boolean {
  if (!sel || !addr) return false
  if (sel.file !== file) return false
  if (sel.side !== addr.side) return false
  const max = Math.max(sel.anchorLine, sel.endLine)
  return addr.lineNo === max
}

const VIEW_MODE_KEY = 'prism.diff-view-mode'
const SIDEBAR_KEY = 'prism.diff-sidebar-collapsed'
const WRAP_KEY = 'prism.diff-line-wrap'
const viewedKey = (prKey: string) => `prism.pr-viewed.${prKey}`

const MAX_LINES_PER_FILE = 1500
const SMALL_FILE_THRESHOLD = 80

export function DiffViewer({
  prKey,
  prNodeId,
  pendingReviewId,
  files,
  additions,
  deletions,
  threads,
  onAfterMutation,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode())
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readSidebarCollapsed(),
  )
  const [wrap, setWrap] = useState<boolean>(() => readWrap())
  const [viewed, setViewed] = useState<Record<string, string>>(() =>
    readViewed(prKey),
  )
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    initialOpenMap(files, readViewed(prKey)),
  )
  const [selection, setSelection] = useState<Selection | null>(null)
  const isMouseDownRef = useRef(false)

  useEffect(() => {
    setSelection(null)
  }, [prKey])

  useEffect(() => {
    function up() {
      isMouseDownRef.current = false
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelection(null)
      }
    }
    document.addEventListener('mouseup', up)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mouseup', up)
      document.removeEventListener('keydown', key)
    }
  }, [])

  const onRowMouseDown = useCallback(
    (file: string, addr: LineAddr) => {
      isMouseDownRef.current = true
      setSelection({
        file,
        side: addr.side,
        anchorLine: addr.lineNo,
        endLine: addr.lineNo,
      })
    },
    [],
  )

  const onRowMouseEnter = useCallback((file: string, addr: LineAddr) => {
    if (!isMouseDownRef.current) return
    setSelection((prev) => {
      if (!prev) return prev
      if (prev.file !== file) return prev
      if (prev.side !== addr.side) return prev
      return { ...prev, endLine: addr.lineNo }
    })
  }, [])

  const submitComment = useCallback(
    async (args: AddCommentArgs) => {
      let reviewId = pendingReviewId
      if (!reviewId) {
        reviewId = await api.startPrReview(prNodeId)
      }
      await api.addPrReviewThread({
        reviewId,
        path: args.file,
        line: args.line,
        side: args.side,
        startLine: args.startLine,
        startSide: args.startSide,
        body: args.body,
      })
      setSelection(null)
      await onAfterMutation()
    },
    [pendingReviewId, prNodeId, onAfterMutation],
  )

  const cancelSelection = useCallback(() => setSelection(null), [])

  useEffect(() => {
    setViewed(readViewed(prKey))
    setOpenMap(initialOpenMap(files, readViewed(prKey)))
  }, [prKey, files])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(WRAP_KEY, wrap ? '1' : '0')
    } catch {
      // ignore
    }
  }, [wrap])

  useEffect(() => {
    try {
      localStorage.setItem(viewedKey(prKey), JSON.stringify(viewed))
    } catch {
      // ignore
    }
  }, [prKey, viewed])

  const fileRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const setFileRef = useCallback(
    (filename: string, el: HTMLLIElement | null) => {
      if (el) fileRefs.current.set(filename, el)
      else fileRefs.current.delete(filename)
    },
    [],
  )

  const setOpen = useCallback((filename: string, open: boolean) => {
    setOpenMap((m) => ({ ...m, [filename]: open }))
  }, [])

  const setAllOpen = useCallback(
    (open: boolean) => {
      const next: Record<string, boolean> = {}
      for (const f of files) next[f.filename] = open
      setOpenMap(next)
    },
    [files],
  )

  const scrollToFile = useCallback(
    (filename: string) => {
      setOpen(filename, true)
      requestAnimationFrame(() => {
        fileRefs.current.get(filename)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    },
    [setOpen],
  )

  const toggleViewed = useCallback(
    (file: PrFile) => {
      const wasViewed = viewed[file.filename] === file.sha
      setViewed((prev) => {
        const next = { ...prev }
        if (wasViewed) delete next[file.filename]
        else next[file.filename] = file.sha
        return next
      })
      setOpenMap((prev) => ({
        ...prev,
        [file.filename]: wasViewed,
      }))
    },
    [viewed],
  )

  const viewedCount = useMemo(
    () => files.filter((f) => viewed[f.filename] === f.sha).length,
    [files, viewed],
  )

  if (files.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Sem arquivos alterados.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {!sidebarCollapsed && (
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Arquivos</span>
            <span className="ml-auto tabular-nums">
              {viewedCount}/{files.length}
            </span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Recolher lista"
              title="Recolher lista"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          </div>
          <ol className="flex-1 overflow-y-auto py-1">
            {files.map((f) => (
              <FileSidebarItem
                key={f.filename}
                file={f}
                viewed={viewed[f.filename] === f.sha}
                onClick={() => scrollToFile(f.filename)}
                onToggleViewed={() => toggleViewed(f)}
              />
            ))}
          </ol>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Mostrar lista de arquivos"
              title="Mostrar lista de arquivos"
            >
              <PanelLeftOpen className="size-3.5" />
            </button>
          )}
          <span className="inline-flex items-center gap-2 text-[11px] tabular-nums">
            <span className="text-emerald-400">+{additions}</span>
            <span className="text-rose-400">-{deletions}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ToolbarButton
              onClick={() => setAllOpen(false)}
              icon={ChevronsDownUp}
              label="Recolher tudo"
            />
            <ToolbarButton
              onClick={() => setAllOpen(true)}
              icon={ChevronsUpDown}
              label="Expandir tudo"
            />
            <div className="mx-1 h-4 w-px bg-border" />
            <ToolbarToggle
              active={wrap}
              onClick={() => setWrap((v) => !v)}
              icon={WrapText}
              label="Wrap"
            />
            <div className="mx-1 h-4 w-px bg-border" />
            <ToolbarToggle
              active={viewMode === 'unified'}
              onClick={() => setViewMode('unified')}
              icon={Rows3}
              label="Unified"
            />
            <ToolbarToggle
              active={viewMode === 'split'}
              onClick={() => setViewMode('split')}
              icon={Columns2}
              label="Split"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <ol className="flex flex-col gap-3">
            {files.map((f) => {
              const isViewed = viewed[f.filename] === f.sha
              const isOpen = openMap[f.filename] ?? false
              const fileThreads = threads.filter((t) => t.path === f.filename)
              return (
                <FileBlock
                  key={f.filename}
                  file={f}
                  viewMode={viewMode}
                  wrap={wrap}
                  open={isOpen}
                  viewed={isViewed}
                  threads={fileThreads}
                  onAfterMutation={onAfterMutation}
                  onToggleOpen={() => setOpen(f.filename, !isOpen)}
                  onToggleViewed={() => toggleViewed(f)}
                  setRef={(el) => setFileRef(f.filename, el)}
                  selection={selection}
                  onRowMouseDown={onRowMouseDown}
                  onRowMouseEnter={onRowMouseEnter}
                  onSubmitComment={submitComment}
                  onCancelSelection={cancelSelection}
                />
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void
  icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={label}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function ToolbarToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
      title={label}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function FileSidebarItem({
  file,
  viewed,
  onClick,
  onToggleViewed,
}: {
  file: PrFile
  viewed: boolean
  onClick: () => void
  onToggleViewed: () => void
}) {
  const slash = file.filename.lastIndexOf('/')
  const basename = slash >= 0 ? file.filename.slice(slash + 1) : file.filename
  const dirname = slash >= 0 ? file.filename.slice(0, slash) : ''

  return (
    <li>
      <div
        className={`group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent ${
          viewed ? 'opacity-50' : ''
        }`}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <StatusIcon status={file.status} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`truncate font-mono text-[12px] text-foreground/90 ${
                viewed ? 'line-through' : ''
              }`}
              title={file.filename}
            >
              {basename}
            </span>
            {dirname && (
              <span
                className="truncate font-mono text-[10px] text-muted-foreground/60"
                title={dirname}
              >
                {dirname}
              </span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
            {file.additions > 0 && (
              <span className="text-emerald-400">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-rose-400">-{file.deletions}</span>
            )}
          </span>
        </button>
        <ViewedCheckbox checked={viewed} onChange={onToggleViewed} />
      </div>
    </li>
  )
}

function ViewedCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked
          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
          : 'border-border bg-card text-transparent hover:border-foreground/30'
      }`}
      aria-label={checked ? 'Marcar como não visto' : 'Marcar como visto'}
      title={checked ? 'Marcado como visto' : 'Marcar como visto'}
    >
      <Check className="size-3" />
    </button>
  )
}

function FileBlock({
  file,
  viewMode,
  wrap,
  open,
  viewed,
  threads,
  onAfterMutation,
  onToggleOpen,
  onToggleViewed,
  setRef,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
  onSubmitComment,
  onCancelSelection,
}: {
  file: PrFile
  viewMode: ViewMode
  wrap: boolean
  open: boolean
  viewed: boolean
  threads: ReviewThread[]
  onAfterMutation: () => Promise<void>
  onToggleOpen: () => void
  onToggleViewed: () => void
  setRef: (el: HTMLLIElement | null) => void
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
  onSubmitComment: (args: AddCommentArgs) => Promise<void>
  onCancelSelection: () => void
}) {
  const displayName =
    file.previous_filename && file.previous_filename !== file.filename
      ? `${file.previous_filename} → ${file.filename}`
      : file.filename

  return (
    <li
      ref={setRef}
      className={`scroll-mt-2 rounded-xl bg-card ring-1 ring-foreground/10 ${
        viewed ? 'opacity-70' : ''
      }`}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <StatusIcon status={file.status} />
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90"
          title={displayName}
        >
          {displayName}
        </span>
        {threads.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={`${threads.length} comentário(s)`}
          >
            <MessageSquare className="size-3" />
            {threads.length}
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
          {file.additions > 0 && (
            <span className="text-emerald-400">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-rose-400">-{file.deletions}</span>
          )}
        </span>
        {file.blob_url && (
          <button
            type="button"
            onClick={() => api.openUrl(file.blob_url as string)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Abrir no GitHub"
            title="Abrir no GitHub"
          >
            <ExternalLink className="size-3.5" />
          </button>
        )}
        <ViewedCheckbox checked={viewed} onChange={onToggleViewed} />
      </header>
      {open && (
        <div className="border-t border-border">
          <FileBody
            file={file}
            viewMode={viewMode}
            wrap={wrap}
            threads={threads}
            onAfterMutation={onAfterMutation}
            selection={selection}
            onRowMouseDown={onRowMouseDown}
            onRowMouseEnter={onRowMouseEnter}
            onSubmitComment={onSubmitComment}
            onCancelSelection={onCancelSelection}
          />
        </div>
      )}
    </li>
  )
}

function FileBody({
  file,
  viewMode,
  wrap,
  threads,
  onAfterMutation,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
  onSubmitComment,
  onCancelSelection,
}: {
  file: PrFile
  viewMode: ViewMode
  wrap: boolean
  threads: ReviewThread[]
  onAfterMutation: () => Promise<void>
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
  onSubmitComment: (args: AddCommentArgs) => Promise<void>
  onCancelSelection: () => void
}) {
  if (!file.patch) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {file.status === 'renamed'
            ? 'Arquivo renomeado sem mudanças de conteúdo.'
            : file.changes === 0
              ? 'Sem mudanças textuais.'
              : 'Sem patch disponível (provavelmente binário ou muito grande). '}
          {file.blob_url && (
            <button
              type="button"
              onClick={() => api.openUrl(file.blob_url as string)}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
            >
              Ver no GitHub <ExternalLink className="size-3" />
            </button>
          )}
        </p>
        {threads.length > 0 && (
          <ThreadList
            threads={threads}
            onAfterMutation={onAfterMutation}
            showFile={false}
          />
        )}
      </div>
    )
  }
  return (
    <DiffContent
      filename={file.filename}
      patch={file.patch}
      blobUrl={file.blob_url}
      viewMode={viewMode}
      wrap={wrap}
      threads={threads}
      onAfterMutation={onAfterMutation}
      selection={selection}
      onRowMouseDown={onRowMouseDown}
      onRowMouseEnter={onRowMouseEnter}
      onSubmitComment={onSubmitComment}
      onCancelSelection={onCancelSelection}
    />
  )
}

function ThreadList({
  threads,
  onAfterMutation,
  showFile,
}: {
  threads: ReviewThread[]
  onAfterMutation: () => Promise<void>
  showFile?: boolean
}) {
  return (
    <ul className="flex flex-col gap-3">
      {threads.map((t) => (
        <ReviewThreadCard
          key={t.id}
          thread={t}
          showFile={showFile}
          onReply={async (body) => {
            await api.addReviewThreadReply(t.id, body)
            await onAfterMutation()
          }}
          onResolveToggle={async () => {
            if (t.is_resolved) await api.unresolveReviewThread(t.id)
            else await api.resolveReviewThread(t.id)
            await onAfterMutation()
          }}
        />
      ))}
    </ul>
  )
}

function DiffContent({
  filename,
  patch,
  blobUrl,
  viewMode,
  wrap,
  threads,
  onAfterMutation,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
  onSubmitComment,
  onCancelSelection,
}: {
  filename: string
  patch: string
  blobUrl: string | null
  viewMode: ViewMode
  wrap: boolean
  threads: ReviewThread[]
  onAfterMutation: () => Promise<void>
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
  onSubmitComment: (args: AddCommentArgs) => Promise<void>
  onCancelSelection: () => void
}) {
  const hunks = useMemo(() => parseDiff(patch), [patch])
  const totalLines = useMemo(
    () => hunks.reduce((n, h) => n + h.lines.length, 0),
    [hunks],
  )

  const lang = useMemo(() => getLanguageFromFilename(filename), [filename])
  const highlightLine = useHighlightLine(lang)

  const { lineThreads, orphaned } = useMemo(
    () => groupThreadsByLine(hunks, threads),
    [hunks, threads],
  )

  if (totalLines === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="px-4 py-3 text-xs text-muted-foreground">Diff vazio.</p>
        {threads.length > 0 && (
          <div className="px-4 pb-3">
            <ThreadList
              threads={threads}
              onAfterMutation={onAfterMutation}
              showFile={false}
            />
          </div>
        )}
      </div>
    )
  }

  if (totalLines > MAX_LINES_PER_FILE) {
    return (
      <div className="flex flex-col gap-3">
        <div className="px-4 py-3 text-xs text-muted-foreground">
          Diff muito grande pra renderizar aqui ({totalLines} linhas).
          {blobUrl && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => api.openUrl(blobUrl)}
                className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
              >
                Abrir no GitHub <ExternalLink className="size-3" />
              </button>
            </>
          )}
        </div>
        {threads.length > 0 && (
          <div className="px-4 pb-3">
            <ThreadList
              threads={threads}
              onAfterMutation={onAfterMutation}
              showFile={false}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {viewMode === 'split' ? (
        <SplitDiff
          file={filename}
          hunks={hunks}
          wrap={wrap}
          highlightLine={highlightLine}
          lineThreads={lineThreads}
          onAfterMutation={onAfterMutation}
          selection={selection}
          onRowMouseDown={onRowMouseDown}
          onRowMouseEnter={onRowMouseEnter}
          onSubmitComment={onSubmitComment}
          onCancelSelection={onCancelSelection}
        />
      ) : (
        <UnifiedDiff
          file={filename}
          hunks={hunks}
          wrap={wrap}
          highlightLine={highlightLine}
          lineThreads={lineThreads}
          onAfterMutation={onAfterMutation}
          selection={selection}
          onRowMouseDown={onRowMouseDown}
          onRowMouseEnter={onRowMouseEnter}
          onSubmitComment={onSubmitComment}
          onCancelSelection={onCancelSelection}
        />
      )}
      {orphaned.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Comentários fora do diff atual
          </p>
          <ThreadList
            threads={orphaned}
            onAfterMutation={onAfterMutation}
            showFile={false}
          />
        </div>
      )}
    </>
  )
}

function groupThreadsByLine(
  hunks: Hunk[],
  threads: ReviewThread[],
): { lineThreads: Map<DiffLine, ReviewThread[]>; orphaned: ReviewThread[] } {
  const map = new Map<DiffLine, ReviewThread[]>()
  const matched = new Set<string>()
  for (const h of hunks) {
    for (const line of h.lines) {
      const here = threads.filter(
        (t) => !matched.has(t.id) && lineMatchesThread(line, t),
      )
      if (here.length > 0) {
        map.set(line, here)
        for (const t of here) matched.add(t.id)
      }
    }
  }
  const orphaned = threads.filter((t) => !matched.has(t.id))
  return { lineThreads: map, orphaned }
}

function lineMatchesThread(line: DiffLine, t: ReviewThread): boolean {
  if (t.line == null) return false
  if (line.kind === 'del') return line.old === t.line
  return line.new === t.line
}

function UnifiedDiff({
  file,
  hunks,
  wrap,
  highlightLine,
  lineThreads,
  onAfterMutation,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
  onSubmitComment,
  onCancelSelection,
}: {
  file: string
  hunks: Hunk[]
  wrap: boolean
  highlightLine: HighlightLineFn
  lineThreads: Map<DiffLine, ReviewThread[]>
  onAfterMutation: () => Promise<void>
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
  onSubmitComment: (args: AddCommentArgs) => Promise<void>
  onCancelSelection: () => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12px] leading-5">
        <tbody>
          {hunks.map((h, i) => (
            <Fragment key={i}>
              <tr className="bg-muted/40">
                <td
                  colSpan={3}
                  className="select-none px-4 py-1 text-[11px] text-muted-foreground/80"
                >
                  @@ -{h.oldStart} +{h.newStart} @@
                  {h.header && (
                    <span className="ml-2 text-muted-foreground/60">
                      {h.header}
                    </span>
                  )}
                </td>
              </tr>
              {h.lines.map((line, j) => {
                const ts = lineThreads.get(line)
                const addr = lineAddrUnified(line)
                const selected = isAddrInSelection(file, addr, selection)
                const isEnd = isAddrAtSelectionEnd(file, addr, selection)
                return (
                  <Fragment key={j}>
                    <UnifiedRow
                      line={line}
                      wrap={wrap}
                      highlightLine={highlightLine}
                      selected={selected}
                      onMouseDown={
                        addr
                          ? () => onRowMouseDown(file, addr)
                          : undefined
                      }
                      onMouseEnter={
                        addr
                          ? () => onRowMouseEnter(file, addr)
                          : undefined
                      }
                    />
                    {isEnd && selection && (
                      <tr>
                        <td
                          colSpan={3}
                          className="bg-background/40 px-4 py-3 font-sans"
                        >
                          <CommentEditorRow
                            selection={selection}
                            file={file}
                            onSubmit={onSubmitComment}
                            onCancel={onCancelSelection}
                          />
                        </td>
                      </tr>
                    )}
                    {ts && ts.length > 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="border-y border-border/60 bg-background/40 px-4 py-3 font-sans"
                        >
                          <ThreadList
                            threads={ts}
                            onAfterMutation={onAfterMutation}
                            showFile={false}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnifiedRow({
  line,
  wrap,
  highlightLine,
  selected,
  onMouseDown,
  onMouseEnter,
}: {
  line: DiffLine
  wrap: boolean
  highlightLine: HighlightLineFn
  selected: boolean
  onMouseDown?: () => void
  onMouseEnter?: () => void
}) {
  const tone =
    line.kind === 'add'
      ? 'bg-emerald-500/10'
      : line.kind === 'del'
        ? 'bg-rose-500/10'
        : ''
  const sign = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  const signTone =
    line.kind === 'add'
      ? 'text-emerald-400/80'
      : line.kind === 'del'
        ? 'text-rose-400/80'
        : 'text-muted-foreground/40'
  const oldNum = line.kind === 'add' ? '' : line.old
  const newNum = line.kind === 'del' ? '' : line.new
  const wrapClass = wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
  const selectionTone = selected ? 'bg-primary/15 ring-1 ring-inset ring-primary/30' : ''

  return (
    <tr
      className={`${tone} ${selectionTone} ${onMouseDown ? 'cursor-cell' : ''}`}
      onMouseDown={(e) => {
        if (onMouseDown && e.button === 0) {
          e.preventDefault()
          onMouseDown()
        }
      }}
      onMouseEnter={onMouseEnter}
    >
      <td className="w-12 select-none border-r border-border/40 px-2 align-top text-right text-[11px] tabular-nums text-muted-foreground/50">
        {oldNum}
      </td>
      <td className="w-12 select-none border-r border-border/40 px-2 align-top text-right text-[11px] tabular-nums text-muted-foreground/50">
        {newNum}
      </td>
      <td className={`${wrapClass} px-3 text-foreground/90`}>
        <span className={`mr-2 select-none ${signTone}`}>{sign}</span>
        <HighlightedText text={line.text} highlightLine={highlightLine} />
      </td>
    </tr>
  )
}

function CommentEditorRow({
  selection,
  file,
  onSubmit,
  onCancel,
}: {
  selection: Selection
  file: string
  onSubmit: (args: AddCommentArgs) => Promise<void>
  onCancel: () => void
}) {
  const start = Math.min(selection.anchorLine, selection.endLine)
  const end = Math.max(selection.anchorLine, selection.endLine)
  const range = start === end ? `linha ${end}` : `linhas ${start}–${end}`
  const sideLabel = selection.side === 'RIGHT' ? 'novo' : 'antigo'
  return (
    <CommentEditor
      contextLabel={`Comentando em ${file} · ${range} (${sideLabel})`}
      onSubmit={async (body) => {
        await onSubmit({
          file,
          side: selection.side,
          line: end,
          startLine: start === end ? null : start,
          startSide: start === end ? null : selection.side,
          body,
        })
      }}
      onCancel={onCancel}
    />
  )
}

function SplitDiff({
  file,
  hunks,
  wrap,
  highlightLine,
  lineThreads,
  onAfterMutation,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
  onSubmitComment,
  onCancelSelection,
}: {
  file: string
  hunks: Hunk[]
  wrap: boolean
  highlightLine: HighlightLineFn
  lineThreads: Map<DiffLine, ReviewThread[]>
  onAfterMutation: () => Promise<void>
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
  onSubmitComment: (args: AddCommentArgs) => Promise<void>
  onCancelSelection: () => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse font-mono text-[12px] leading-5">
        <colgroup>
          <col className="w-12" />
          <col className="w-1/2" />
          <col className="w-12" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          {hunks.map((h, i) => (
            <Fragment key={i}>
              <tr className="bg-muted/40">
                <td
                  colSpan={4}
                  className="select-none px-4 py-1 text-[11px] text-muted-foreground/80"
                >
                  @@ -{h.oldStart} +{h.newStart} @@
                  {h.header && (
                    <span className="ml-2 text-muted-foreground/60">
                      {h.header}
                    </span>
                  )}
                </td>
              </tr>
              {pairLines(h.lines).map((row, j) => {
                const seen = new Set<string>()
                const collected: ReviewThread[] = []
                for (const side of [row.left, row.right]) {
                  if (!side) continue
                  const ts = lineThreads.get(side)
                  if (!ts) continue
                  for (const t of ts) {
                    if (seen.has(t.id)) continue
                    seen.add(t.id)
                    collected.push(t)
                  }
                }
                const leftAddr = row.left
                  ? lineAddrSplit(row.left, 'left')
                  : null
                const rightAddr = row.right
                  ? lineAddrSplit(row.right, 'right')
                  : null
                const showEditor =
                  isAddrAtSelectionEnd(file, leftAddr, selection) ||
                  isAddrAtSelectionEnd(file, rightAddr, selection)
                return (
                  <Fragment key={j}>
                    <SplitRow
                      file={file}
                      row={row}
                      wrap={wrap}
                      highlightLine={highlightLine}
                      selection={selection}
                      onRowMouseDown={onRowMouseDown}
                      onRowMouseEnter={onRowMouseEnter}
                    />
                    {showEditor && selection && (
                      <tr>
                        <td
                          colSpan={4}
                          className="bg-background/40 px-4 py-3 font-sans"
                        >
                          <CommentEditorRow
                            selection={selection}
                            file={file}
                            onSubmit={onSubmitComment}
                            onCancel={onCancelSelection}
                          />
                        </td>
                      </tr>
                    )}
                    {collected.length > 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="border-y border-border/60 bg-background/40 px-4 py-3 font-sans"
                        >
                          <ThreadList
                            threads={collected}
                            onAfterMutation={onAfterMutation}
                            showFile={false}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type SbsRow = {
  left: DiffLine | null
  right: DiffLine | null
}

function pairLines(lines: DiffLine[]): SbsRow[] {
  const rows: SbsRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []

  const flush = () => {
    const max = Math.max(dels.length, adds.length)
    for (let i = 0; i < max; i++) {
      rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    }
    dels = []
    adds = []
  }

  for (const line of lines) {
    if (line.kind === 'del') dels.push(line)
    else if (line.kind === 'add') adds.push(line)
    else {
      flush()
      rows.push({ left: line, right: line })
    }
  }
  flush()
  return rows
}

function SplitRow({
  file,
  row,
  wrap,
  highlightLine,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
}: {
  file: string
  row: SbsRow
  wrap: boolean
  highlightLine: HighlightLineFn
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
}) {
  return (
    <tr>
      <SplitCell
        file={file}
        line={row.left}
        side="left"
        wrap={wrap}
        highlightLine={highlightLine}
        selection={selection}
        onRowMouseDown={onRowMouseDown}
        onRowMouseEnter={onRowMouseEnter}
      />
      <SplitCell
        file={file}
        line={row.right}
        side="right"
        wrap={wrap}
        highlightLine={highlightLine}
        selection={selection}
        onRowMouseDown={onRowMouseDown}
        onRowMouseEnter={onRowMouseEnter}
      />
    </tr>
  )
}

function SplitCell({
  file,
  line,
  side,
  wrap,
  highlightLine,
  selection,
  onRowMouseDown,
  onRowMouseEnter,
}: {
  file: string
  line: DiffLine | null
  side: 'left' | 'right'
  wrap: boolean
  highlightLine: HighlightLineFn
  selection: Selection | null
  onRowMouseDown: (file: string, addr: LineAddr) => void
  onRowMouseEnter: (file: string, addr: LineAddr) => void
}) {
  if (!line) {
    return (
      <>
        <td className="w-12 select-none border-r border-border/40 bg-muted/20" />
        <td className="bg-muted/20" />
      </>
    )
  }
  const showOnThisSide =
    side === 'left'
      ? line.kind !== 'add'
      : line.kind !== 'del'
  if (!showOnThisSide) {
    return (
      <>
        <td className="w-12 select-none border-r border-border/40 bg-muted/20" />
        <td className="bg-muted/20" />
      </>
    )
  }
  const tone =
    line.kind === 'add'
      ? 'bg-emerald-500/10'
      : line.kind === 'del'
        ? 'bg-rose-500/10'
        : ''
  const sign = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  const signTone =
    line.kind === 'add'
      ? 'text-emerald-400/80'
      : line.kind === 'del'
        ? 'text-rose-400/80'
        : 'text-muted-foreground/40'
  const num =
    line.kind === 'context' ? (side === 'left' ? line.old : line.new)
    : line.kind === 'del' ? line.old
    : line.new
  const innerClass = wrap
    ? 'whitespace-pre-wrap break-all'
    : 'overflow-hidden whitespace-pre'
  const addr = lineAddrSplit(line, side)
  const selected = isAddrInSelection(file, addr, selection)
  const selectionTone = selected ? 'bg-primary/15 ring-1 ring-inset ring-primary/30' : ''
  const cellHandlers = addr
    ? {
        onMouseDown: (e: React.MouseEvent<HTMLTableCellElement>) => {
          if (e.button === 0) {
            e.preventDefault()
            onRowMouseDown(file, addr)
          }
        },
        onMouseEnter: () => onRowMouseEnter(file, addr),
        className: 'cursor-cell',
      }
    : { className: '' }

  return (
    <>
      <td
        className={`w-12 select-none border-r border-border/40 px-2 align-top text-right text-[11px] tabular-nums text-muted-foreground/50 ${tone} ${selectionTone} ${cellHandlers.className}`}
        onMouseDown={cellHandlers.onMouseDown}
        onMouseEnter={cellHandlers.onMouseEnter}
      >
        {num}
      </td>
      <td
        className={`px-3 align-top text-foreground/90 ${tone} ${selectionTone} ${cellHandlers.className}`}
        onMouseDown={cellHandlers.onMouseDown}
        onMouseEnter={cellHandlers.onMouseEnter}
      >
        <div className={innerClass}>
          <span className={`mr-2 select-none ${signTone}`}>{sign}</span>
          <HighlightedText text={line.text} highlightLine={highlightLine} />
        </div>
      </td>
    </>
  )
}

type StatusKey =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged'

const STATUS_CONFIG: Record<
  StatusKey,
  { icon: LucideIcon; color: string; label: string }
> = {
  added: { icon: FilePlus, color: 'text-emerald-400', label: 'Adicionado' },
  removed: { icon: FileMinus, color: 'text-rose-400', label: 'Removido' },
  modified: { icon: FilePen, color: 'text-amber-400', label: 'Modificado' },
  renamed: {
    icon: FileSymlink,
    color: 'text-violet-400',
    label: 'Renomeado',
  },
  copied: { icon: FileSymlink, color: 'text-violet-400', label: 'Copiado' },
  changed: { icon: FilePen, color: 'text-amber-400', label: 'Alterado' },
  unchanged: {
    icon: FileDiff,
    color: 'text-muted-foreground/60',
    label: 'Sem mudança',
  },
}

function StatusIcon({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? STATUS_CONFIG.modified
  const Icon = cfg.icon
  return (
    <Icon className={`size-3.5 shrink-0 ${cfg.color}`} aria-label={cfg.label} />
  )
}

function readViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    if (v === 'split' || v === 'unified') return v
  } catch {
    // ignore
  }
  return 'unified'
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function readWrap(): boolean {
  try {
    return localStorage.getItem(WRAP_KEY) === '1'
  } catch {
    return false
  }
}

function readViewed(prKey: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(viewedKey(prKey))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string>
    }
  } catch {
    // ignore
  }
  return {}
}

function initialOpenMap(
  files: PrFile[],
  viewed: Record<string, string>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const f of files) {
    if (viewed[f.filename] === f.sha) {
      out[f.filename] = false
      continue
    }
    out[f.filename] = f.changes <= SMALL_FILE_THRESHOLD && Boolean(f.patch)
  }
  return out
}
