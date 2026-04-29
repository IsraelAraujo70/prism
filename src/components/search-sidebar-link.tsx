import { Search } from 'lucide-react'

type Props = {
  collapsed: boolean
  onClick: () => void
}

export function SearchSidebarLink({ collapsed, onClick }: Props) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Buscar (Ctrl+K)"
        className="group mx-auto mt-1 flex size-9 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <Search className="size-4" />
      </button>
    )
  }

  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
      >
        <Search className="size-3.5 shrink-0 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60" />
        <span className="flex-1 truncate text-sm text-sidebar-foreground/80 group-hover:text-sidebar-foreground">
          Buscar
        </span>
        <kbd className="rounded border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-sidebar-foreground/50">
          Ctrl K
        </kbd>
      </button>
    </div>
  )
}
