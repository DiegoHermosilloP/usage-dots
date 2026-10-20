export type Gauge = {
  label: string
  percent: number
  resetsAt?: string
  /** Context only: tokens in the window and the window's size. */
  tokens?: number
  window?: number
  /** Context only: the largest category of what fills the window, and its tokens. */
  top?: { name: string; tokens: number }
  /** Usage only: the 7-day window's percent, shown in the hover card. */
  weekly?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-dots': { gauges: Gauge[]; draftTokens: number }
  }
}
