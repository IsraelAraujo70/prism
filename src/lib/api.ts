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

export type AuthStatus = {
  authenticated: boolean
  user: GithubUser | null
}

export const api = {
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  saveToken: (token: string) => invoke<AuthStatus>('save_token', { token }),
  logout: () => invoke<void>('logout'),
  listRepos: () => invoke<Repo[]>('list_repos'),
}
