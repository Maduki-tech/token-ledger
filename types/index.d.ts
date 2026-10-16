export type LedgerView = {
  screen: 'projects' | 'sessions' | 'session'
  hours: number
  // project key: a git repo's main checkout, or dir:<folder>
  project?: string
  // the session's ~/.claude/projects folder
  dir?: string
  name?: string
  sid?: string
  page: number
}

export type LedgerData = {
  key: string
  isLoading: boolean
  error?: string
  // the JSON scripts/usage.py printed for `key`
  payload?: any
}

declare module 'claude-code' {
  interface PluginState {
    'token-ledger': { view: LedgerView; data: LedgerData }
  }
}
