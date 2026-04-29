export type DiffLine =
  | { kind: 'context'; old: number; new: number; text: string }
  | { kind: 'add'; new: number; text: string }
  | { kind: 'del'; old: number; text: string }

export type Hunk = {
  oldStart: number
  newStart: number
  header: string
  lines: DiffLine[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

export function parseDiff(patch: string): Hunk[] {
  const hunks: Hunk[] = []
  let current: Hunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const raw of patch.split('\n')) {
    const match = HUNK_HEADER.exec(raw)
    if (match) {
      oldNo = parseInt(match[1], 10)
      newNo = parseInt(match[2], 10)
      current = {
        oldStart: oldNo,
        newStart: newNo,
        header: match[3].trim(),
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (raw.startsWith('+')) {
      current.lines.push({ kind: 'add', new: newNo++, text: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      current.lines.push({ kind: 'del', old: oldNo++, text: raw.slice(1) })
    } else if (raw.startsWith(' ')) {
      current.lines.push({
        kind: 'context',
        old: oldNo++,
        new: newNo++,
        text: raw.slice(1),
      })
    }
  }
  return hunks
}

export function lineMatchesPosition(line: DiffLine, target: number): boolean {
  if (line.kind === 'del') return line.old === target
  return line.new === target
}

export function extractDiffSnippet(
  patch: string,
  targetLine: number,
  contextLines = 4,
): DiffLine[] | null {
  const hunks = parseDiff(patch)
  for (const hunk of hunks) {
    for (let i = 0; i < hunk.lines.length; i++) {
      if (lineMatchesPosition(hunk.lines[i], targetLine)) {
        const start = Math.max(0, i - contextLines + 1)
        return hunk.lines.slice(start, i + 1)
      }
    }
  }
  return null
}
