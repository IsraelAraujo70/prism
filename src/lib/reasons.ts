import {
  Activity,
  AtSign,
  Bell,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

export const PUSH_REASONS = [
  'review_requested',
  'mention',
  'team_mention',
  'comment',
  'assign',
  'state_change',
  'ci_activity',
] as const

const REASON_LABELS: Record<string, string> = {
  review_requested: 'Pediram seu review',
  mention: 'Mencionado',
  team_mention: 'Time mencionado',
  comment: 'Comentário',
  author: 'Autor',
  assign: 'Atribuído',
  state_change: 'Mudança de estado',
  ci_activity: 'CI',
  subscribed: 'Inscrito',
  push: 'Novo commit',
  security_alert: 'Alerta de segurança',
  manual: 'Manual',
}

const REASON_ICONS: Record<string, LucideIcon> = {
  review_requested: GitPullRequest,
  mention: AtSign,
  team_mention: AtSign,
  comment: MessageSquare,
  author: GitPullRequest,
  assign: UserPlus,
  state_change: GitMerge,
  ci_activity: Activity,
  push: GitMerge,
  security_alert: ShieldAlert,
}

export function labelForReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')
}

export function iconForReason(reason: string): LucideIcon {
  return REASON_ICONS[reason] ?? Bell
}
