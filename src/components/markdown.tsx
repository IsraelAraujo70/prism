import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { api } from '@/lib/api'

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'sub',
    'sup',
    'kbd',
    'details',
    'summary',
    'mark',
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    details: [...((defaultSchema.attributes ?? {}).details ?? []), 'open'],
  },
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-3 mb-2 text-base font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-2 text-sm font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1.5 text-sm font-medium text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1.5 text-sm font-medium text-foreground/90 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-sm leading-relaxed text-foreground/90 first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        if (href && /^https?:\/\//.test(href)) {
          e.preventDefault()
          api.openUrl(href)
        }
      }}
      className="text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc pl-5 text-sm text-foreground/90 first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 text-sm text-foreground/90 first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="my-0.5 leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className={`${className} font-mono text-xs`}>{children}</code>
      )
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 px-2 py-1 text-sm text-foreground/90">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt}
      className="my-2 max-w-full rounded-md border border-border"
    />
  ),
  input: ({ checked, disabled, type }) => {
    if (type !== 'checkbox') return null
    return (
      <input
        type="checkbox"
        checked={checked ?? false}
        disabled={disabled ?? true}
        readOnly
        className="mr-1.5 size-3.5 -translate-y-px align-middle accent-primary"
      />
    )
  },
  sub: ({ children }) => (
    <sub className="text-[0.75em] text-muted-foreground">{children}</sub>
  ),
  sup: ({ children }) => <sup className="text-[0.75em]">{children}</sup>,
  kbd: ({ children }) => (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/80">
      {children}
    </kbd>
  ),
  details: ({ children }) => (
    <details className="my-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      {children}
    </details>
  ),
  summary: ({ children }) => (
    <summary className="cursor-pointer select-none text-foreground/90 hover:text-foreground">
      {children}
    </summary>
  ),
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
