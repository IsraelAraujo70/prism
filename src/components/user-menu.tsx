import { LogOut } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { GithubUser } from '@/lib/api'

type Props = {
  user: GithubUser
  onLogout: () => void
  collapsed?: boolean
}

export function UserMenu({ user, onLogout, collapsed = false }: Props) {
  const display = user.name?.trim() || user.login
  const initials = display
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-sidebar-border py-2">
        <Avatar className="size-8" title={`@${user.login}`}>
          <AvatarImage src={user.avatar_url} alt={display} />
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={user.avatar_url} alt={display} />
        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {display}
        </p>
        <p className="truncate text-xs text-sidebar-foreground/40">
          @{user.login}
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label="Sair"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}
