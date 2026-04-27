import { LogOut } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { GithubUser } from '@/lib/api'

type Props = {
  user: GithubUser
  onLogout: () => void
}

export function UserMenu({ user, onLogout }: Props) {
  const display = user.name?.trim() || user.login

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t">
      <Avatar className="size-7">
        <AvatarImage src={user.avatar_url} alt={display} />
        <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{display}</p>
        <p className="text-xs text-muted-foreground truncate">@{user.login}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onLogout}
        aria-label="Sair"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}
