import { Inbox as InboxIcon } from 'lucide-react'

import { useNotifications } from '@/lib/use-notifications'

type Props = {
  collapsed: boolean
  active: boolean
  onClick: () => void
}

export function InboxSidebarLink({ collapsed, active, onClick }: Props) {
  const { unread } = useNotifications()

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={unread > 0 ? `Caixa de entrada (${unread})` : 'Caixa de entrada'}
        className={`group relative mx-auto mt-1 flex size-9 items-center justify-center rounded-md transition-colors ${
          active
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        }`}
      >
        <InboxIcon className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'
        }`}
      >
        <InboxIcon
          className={`size-3.5 shrink-0 transition-colors ${
            active
              ? 'text-sidebar-foreground/70'
              : 'text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60'
          }`}
        />
        <span
          className={`flex-1 truncate text-sm transition-colors ${
            active
              ? 'text-sidebar-foreground'
              : 'text-sidebar-foreground/80 group-hover:text-sidebar-foreground'
          }`}
        >
          Caixa de entrada
        </span>
        {unread > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
