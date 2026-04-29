import { invoke } from '@tauri-apps/api/core'

export type GithubUser = {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

export type RepoOwner = {
  login: string
  avatar_url: string
}

export type Repo = {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  html_url: string
  open_issues_count: number
  pushed_at: string | null
  owner: RepoOwner
}

export type WatchedRepo = {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  html_url: string
  owner_login: string
  owner_avatar_url: string
}

export type OrgRef = {
  login: string
  avatar_url: string
  description: string | null
}

export type AuthStatus = {
  authenticated: boolean
  user: GithubUser | null
}

export type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string | null
  expires_in: number
  interval: number
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'success'; user: GithubUser }
  | { status: 'expired' }
  | { status: 'denied' }

export type PrAuthor = {
  login: string
  avatar_url: string
}

export type PullRequestRef = {
  id: number
  number: number
  title: string
  html_url: string
  repo: string
  author: PrAuthor
  updated_at: string
  comments: number
  draft: boolean
}

export type ContributorStat = {
  login: string
  avatar_url: string
  prs: number
}

export type DashboardStats = {
  open_prs: number
  merged_30d: number
  awaiting_count: number
  contributors_count: number
}

export type Dashboard = {
  stats: DashboardStats
  awaiting_your_review: PullRequestRef[]
  your_open_prs: PullRequestRef[]
  contributors: ContributorStat[]
}

export type PrLabel = {
  name: string
  color: string
}

export type ThreadComment = {
  author: PrAuthor | null
  body: string
  created_at: string
  state: string | null
}

export type TimelineEntry =
  | {
      kind: 'comment'
      author: PrAuthor | null
      body: string
      created_at: string
    }
  | {
      kind: 'review'
      author: PrAuthor | null
      body: string
      state: string
      submitted_at: string
    }
  | {
      kind: 'review_thread'
      id: string
      path: string
      line: number | null
      is_resolved: boolean
      is_outdated: boolean
      comments: ThreadComment[]
      created_at: string
    }

export type CheckEntry = {
  name: string
  status: string
  conclusion: string | null
  url: string | null
  started_at: string | null
  completed_at: string | null
  app_name: string | null
  app_logo_url: string | null
  workflow_name: string | null
  description: string | null
}

export type PrFile = {
  sha: string
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  blob_url: string | null
  patch: string | null
  previous_filename: string | null
}

export type PrDetails = {
  id: number
  node_id: string
  number: number
  title: string
  body: string
  state: string
  is_draft: boolean
  html_url: string
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  additions: number
  deletions: number
  changed_files: number
  commits_count: number
  mergeable: string
  base_ref: string
  head_ref: string
  author: PrAuthor | null
  repo: string
  labels: PrLabel[]
  assignees: PrAuthor[]
  review_requests: PrAuthor[]
  timeline: TimelineEntry[]
  checks_state: string | null
  checks: CheckEntry[]
}

export type NotificationRow = {
  id: string
  repo_full: string
  subject_type: string
  subject_url: string | null
  pr_number: number | null
  reason: string
  title: string
  unread: boolean
  updated_at: string
  last_seen_at: string
}

export const api = {
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  startDeviceFlow: () => invoke<DeviceCodeResponse>('start_device_flow'),
  pollDeviceFlow: (deviceCode: string) =>
    invoke<DevicePollResult>('poll_device_flow', { deviceCode }),
  logout: () => invoke<void>('logout'),

  getWatchedRepos: () => invoke<WatchedRepo[]>('get_watched_repos'),
  addWatchedRepo: (repo: WatchedRepo) =>
    invoke<void>('add_watched_repo', { repo }),
  removeWatchedRepo: (repoId: number) =>
    invoke<void>('remove_watched_repo', { repoId }),
  getWatchedIds: () => invoke<number[]>('get_watched_ids'),

  getUserOrgs: () => invoke<OrgRef[]>('get_user_orgs'),
  getOauthClientId: () => invoke<string>('get_oauth_client_id'),
  openUrl: (url: string) => invoke<void>('open_url', { url }),

  getTrackedOrgs: () => invoke<string[]>('get_tracked_orgs'),
  addTrackedOrg: (name: string) => invoke<void>('add_tracked_org', { name }),
  removeTrackedOrg: (name: string) =>
    invoke<void>('remove_tracked_org', { name }),

  listAllRepos: () => invoke<Repo[]>('list_all_repos'),

  getDashboard: (repoFullName?: string | null) =>
    invoke<Dashboard>('get_dashboard', { repoFullName: repoFullName ?? null }),

  getPrDetails: (owner: string, name: string, number: number) =>
    invoke<PrDetails>('get_pr_details', { owner, name, number }),

  getPrFiles: (owner: string, name: string, number: number) =>
    invoke<PrFile[]>('get_pr_files', { owner, name, number }),

  mergePullRequest: (prNodeId: string, method: 'MERGE' | 'SQUASH' | 'REBASE') =>
    invoke<void>('merge_pull_request', { prNodeId, method }),

  addReviewThreadReply: (threadId: string, body: string) =>
    invoke<void>('add_review_thread_reply', { threadId, body }),
  resolveReviewThread: (threadId: string) =>
    invoke<void>('resolve_review_thread', { threadId }),
  unresolveReviewThread: (threadId: string) =>
    invoke<void>('unresolve_review_thread', { threadId }),

  listNotifications: () => invoke<NotificationRow[]>('list_notifications'),
  unreadNotificationCount: () => invoke<number>('unread_notification_count'),
  markNotificationRead: (threadId: string) =>
    invoke<void>('mark_notification_read', { threadId }),
  markAllNotificationsRead: () => invoke<void>('mark_all_notifications_read'),
  syncNotificationsNow: () => invoke<void>('sync_notifications_now'),
}
