import type { HighlightLineFn } from '@/lib/highlight'

export function HighlightedText({
  text,
  highlightLine,
}: {
  text: string
  highlightLine: HighlightLineFn
}) {
  const tokens = highlightLine(text)
  if (!tokens) return <>{text}</>
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={tok.color ? { color: tok.color } : undefined}>
          {tok.content}
        </span>
      ))}
    </>
  )
}
