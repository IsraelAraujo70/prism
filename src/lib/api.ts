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

  getTrackedOrgs: () => invoke<string[]>('get_tracked_orgs'),
  addTrackedOrg: (name: string) => invoke<void>('add_tracked_org', { name }),
  removeTrackedOrg: (name: string) =>
    invoke<void>('remove_tracked_org', { name }),

  listAllRepos: () => invoke<Repo[]>('list_all_repos'),
}
