import {
  bundledLanguages,
  type BundledLanguage,
  type HighlighterCore,
  type ThemedToken,
  createHighlighter,
} from 'shiki'
import { useEffect, useState } from 'react'

const THEME = 'github-dark'

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  rs: 'rust',
  py: 'python',
  pyi: 'python',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  rb: 'ruby',
  php: 'php',
  pl: 'perl',
  swift: 'swift',
  m: 'objective-c',
  mm: 'objective-cpp',
  cs: 'csharp',
  fs: 'fsharp',
  vb: 'vb',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  lua: 'lua',
  zig: 'zig',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  md: 'markdown',
  mdx: 'mdx',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
}

const SPECIAL_FILES: Record<string, BundledLanguage> = {
  Dockerfile: 'docker',
  Makefile: 'makefile',
  GNUmakefile: 'makefile',
  Justfile: 'just',
  Brewfile: 'ruby',
  Gemfile: 'ruby',
  Rakefile: 'ruby',
  CMakeLists: 'cmake',
}

export function getLanguageFromFilename(
  filename: string,
): BundledLanguage | null {
  const slash = filename.lastIndexOf('/')
  const base = slash >= 0 ? filename.slice(slash + 1) : filename
  if (SPECIAL_FILES[base]) return SPECIAL_FILES[base]
  const dot = base.lastIndexOf('.')
  if (dot < 0) return null
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_TO_LANG[ext] ?? null
}

let highlighter: HighlighterCore | null = null
let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()
const loadingLangs = new Map<string, Promise<void>>()

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter)
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: [],
    }).then((h) => {
      highlighter = h
      return h
    })
  }
  return highlighterPromise
}

async function ensureLanguage(lang: BundledLanguage): Promise<void> {
  await getHighlighter()
  if (loadedLangs.has(lang)) return
  const existing = loadingLangs.get(lang)
  if (existing) return existing
  const loader = bundledLanguages[lang]
  if (!loader || !highlighter) return
  const p = (async () => {
    try {
      await highlighter!.loadLanguage(loader)
      loadedLangs.add(lang)
    } finally {
      loadingLangs.delete(lang)
    }
  })()
  loadingLangs.set(lang, p)
  return p
}

export type HighlightLineFn = (text: string) => ThemedToken[] | null

export function useHighlightLine(
  lang: BundledLanguage | null,
): HighlightLineFn {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!lang) return
    if (loadedLangs.has(lang)) {
      setTick((t) => t + 1)
      return
    }
    let cancelled = false
    ensureLanguage(lang)
      .then(() => {
        if (!cancelled) setTick((t) => t + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lang])

  return (text: string) => {
    if (!lang) return null
    if (!highlighter) return null
    if (!loadedLangs.has(lang)) return null
    try {
      const tokens = highlighter.codeToTokensBase(text, {
        lang,
        theme: THEME,
        includeExplanation: false,
      })
      return tokens[0] ?? null
    } catch {
      return null
    }
  }
}
