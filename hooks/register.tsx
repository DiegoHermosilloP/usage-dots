import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Gauge } from '../types'

const gauges = atom({ plugin: 'usage-dots', key: 'gauges' } as const, [] as Gauge[])

const draftTokens = atom({ plugin: 'usage-dots', key: 'draftTokens' } as const, 0)

// No tokenizer is exposed to mods, so this is the usual ~4 characters per token.
const estimate = (text: string) =>
  text.trim() === '' ? 0 : Math.ceil(Array.from(text).length / 4)

const LABELS: Record<string, string> = {
  five_hour: 'Usage',
  spend_limit: 'Spend'
}

const colorOf = (percent: number) =>
  percent >= 85 ? 'red' : percent >= 65 ? 'yellow' : 'green'

const PIES = ['○', '◔', '◑', '◕', '●']
const pieOf = (percent: number) =>
  PIES[Math.min(4, Math.max(0, Math.round(percent / 25)))]

const resetText = (iso: string | undefined) => {
  if (!iso) return ''
  const at = new Date(iso)
  const mins = Math.max(0, Math.round((at.getTime() - Date.now()) / 60000))
  const clock = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return ` · resets in ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m (${clock})`
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`)

const detailOf = (g: Gauge) => {
  const parts = [`${Math.round(g.percent)}% used`]

  if (g.tokens !== undefined && g.window !== undefined) {
    parts.push(`${k(g.tokens)} of ${k(g.window)} tokens`)
  }

  if (g.top) parts.push(`biggest: ${g.top.name} (${k(g.top.tokens)})`)

  if (g.resetsAt) parts.push(`resets in ${resetText(g.resetsAt).slice(11)}`)
  if (g.weekly !== undefined) parts.push(`7-day: ${Math.round(g.weekly)}%`)

  return `${g.label}: ${parts.join(' · ')}`
}

export const register: Register = on => {
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)

    await update($, draftTokens, () => estimate(box.text))

    return box
  })

  on('prompt.change', async ($, e, next) => {
    await update($, draftTokens, () => estimate(e.text))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, draftTokens, () => 0)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const next_: Gauge[] = e.rateLimits
      .filter(r => r.kind in LABELS)
      .map(r => ({
        label: LABELS[r.kind],
        percent: r.percentUsed,
        resetsAt: r.resetsAt,
        weekly:
          r.kind === 'five_hour'
            ? e.rateLimits.find(w => w.kind === 'seven_day')?.percentUsed
            : undefined
      }))

    if (e.context.percent !== undefined) {
      let top: Gauge['top']

      try {
        const { context } = await $.session.usage({ breakdown: 'summary' })
        const used = (context.breakdown?.categories ?? []).filter(c => c.kind === 'used')
        const biggest = used.sort((x, y) => y.tokens - x.tokens)[0]

        if (biggest) top = { name: biggest.name, tokens: biggest.tokens }
      } catch {}

      next_.push({
        top,
        label: 'Context',
        percent: e.context.percent,
        tokens: e.context.tokens,
        window: e.context.window
      })
    }

    await update($, gauges, () => next_)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, gauges)
    const draft = await read($, draftTokens)

    if (e.props.hasSurvey || (list.length === 0 && draft === 0)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Box flexGrow={1}>
            {draft > 0 ? <Text dimColor>Prompt ≈ {draft.toLocaleString()} tokens</Text> : null}
          </Box>
          {list.map(g => (
            <Box key={g.label} hover={{ scope: `usage-dots:${g.label}` }}>
              <Text color={colorOf(g.percent)}>{pieOf(g.percent)} {Math.round(g.percent)}%</Text>
              <Text dimColor> {g.label}{resetText(g.resetsAt)}  </Text>
            </Box>
          ))}
        </Box>
        <Box height={1}>
          {list.map(g => (
            <Box
              key={`card-${g.label}`}
              position="absolute"
              right={0}
              display="none"
              hover={{ scope: `usage-dots:${g.label}`, display: 'flex' }}
            >
              <Text color={colorOf(g.percent)}>{detailOf(g)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
