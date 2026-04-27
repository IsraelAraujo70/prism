---
name: prism-design
description: Design tokens, color system, layout patterns, and component conventions for Prism. Use this whenever building or tweaking UI in src/components.
---

# Prism — design system

shadcn/ui Nova preset, neutral base, **dark mode forced** (`class="dark"` on `<html>`). Light mode CSS exists but is unused.

## Color tokens

Use semantic Tailwind classes, never raw hex. Tokens live in `src/index.css`.

### Sidebar (left rail)

Always use the `sidebar-*` family for anything inside the `<aside>`:

| Class | Use for |
|---|---|
| `bg-sidebar` | Sidebar background |
| `text-sidebar-foreground` | Default text color (use opacity layers below for hierarchy) |
| `bg-sidebar-accent` | Hover background on items |
| `bg-sidebar-accent/40` to `/60` | Subtle hover (for non-clickable rows or secondary surfaces) |
| `border-sidebar-border` | Internal dividers (header bottom, footer top, etc.) |
| `ring-sidebar-ring` | Focus rings for inputs in the sidebar |

**Opacity layers for text** (the secret to looking polished):

| Opacity | Use case |
|---|---|
| `text-sidebar-foreground/90` | Primary item text (resting) |
| `text-sidebar-foreground/80` | Secondary item text |
| `text-sidebar-foreground/60` | Hover text on icons |
| `text-sidebar-foreground/50` | Section labels (uppercase tracking-wider) |
| `text-sidebar-foreground/40` | Muted icons (refresh, settings) at rest |
| `text-sidebar-foreground/30` | Counts, "rest" hints |
| `text-sidebar-foreground/25` | Lock icon, super-muted decoration |
| `text-sidebar-foreground/0` | Hidden until hover (e.g., per-item X buttons) |

Pattern: rest at low opacity, brighten on `group-hover:`. Example:

```tsx
<button className="group flex items-center gap-2 hover:bg-sidebar-accent">
  <GitFork className="size-3.5 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60" />
  <span className="text-sidebar-foreground/80 group-hover:text-sidebar-foreground">{name}</span>
</button>
```

### Main content area

Use the standard shadcn tokens: `bg-background`, `text-foreground`, `bg-card`, `border`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `bg-destructive`, etc. The sidebar tokens stop at the `<aside>` boundary.

### Brand accent

`text-primary` for the GitPullRequest brand icon and accent strokes. Don't overuse — primary is for *the one thing you want noticed* in a view.

## Layout primitives

### Sidebar shell

```tsx
<aside
  style={{ width: collapsed ? 56 : 288 }}
  className="flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out"
>
  {/* h-14 header */}
  {/* flex-1 overflow-y-auto nav */}
  {/* footer with border-t */}
</aside>
```

- Width: **288px expanded**, **56px collapsed**. Nothing in between.
- Transition: `transition-[width] duration-200 ease-out` only. Don't transition other props.
- Header height fixed at `h-14`. Footer is content-sized.
- Nav scrolls; everything else is `shrink-0`.
- Persisted state in `localStorage` keys: `prism.sidebar-collapsed`, `prism.collapsed-orgs`.
- Toggle: click brand area OR the `PanelLeftClose`/`PanelLeftOpen` button. Global shortcut `Ctrl/Cmd+B`.

### Section header inside sidebar

```tsx
<div className="flex items-center justify-between px-4 py-2">
  <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
    Observando
    <span className="ml-1.5 text-sidebar-foreground/30">{count}</span>
  </span>
  <div className="flex items-center gap-0.5">
    {/* compact icon buttons */}
  </div>
</div>
```

### Compact icon button (sidebar)

```tsx
<button className="rounded-md p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
  <Icon className="size-3.5" />  {/* or size-4 for slightly larger */}
</button>
```

### Sidebar item (single line)

```tsx
<div className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent">
  <GitFork className="size-3.5 shrink-0 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60" />
  <span className="truncate text-sm text-sidebar-foreground/80 group-hover:text-sidebar-foreground">{name}</span>
  <button className="rounded-md p-1 text-sidebar-foreground/0 group-hover:text-sidebar-foreground/40 hover:!text-destructive hover:!bg-destructive/10">
    <X className="size-3.5" />
  </button>
</div>
```

Note `text-sidebar-foreground/0 group-hover:text-...` — the X is invisible until the row is hovered. Use `!` (important) on the X's own hover overrides since the group-hover is more specific.

### Collapsible group

`ChevronRight` rotates 90° when expanded:

```tsx
<ChevronRight className={`size-3.5 ${collapsed ? '' : 'rotate-90'} transition-transform duration-150`} />
```

Indent children with `pl-3`.

## Dialogs

Use shadcn `Dialog`. For dialogs with scrollable content, override the default padding:

```tsx
<DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
  <DialogHeader className="px-5 pt-5 pb-3">...</DialogHeader>
  <div className="flex-1 overflow-y-auto px-5 pb-4">...</div>
</DialogContent>
```

This pattern keeps the header fixed and lets the body scroll.

For toggle-able rows inside a dialog (like the AddRepoDialog), the indicator pattern:

```tsx
{/* checked */}
<div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
  <Check className="size-3.5" />
</div>

{/* unchecked, only shows on row hover */}
<div className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
  <Plus className="size-3.5" />
</div>

{/* loading */}
<Loader2 className="size-4 animate-spin text-muted-foreground" />
```

## Standard states

Always handle these four states in any list/data view:

```tsx
{state.status === 'loading' && (
  <Skeleton className="h-10 w-full rounded-md bg-sidebar-accent/40" />
)}

{state.status === 'error' && (
  <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
    {state.message}
  </div>
)}

{state.status === 'ready' && items.length === 0 && (
  <div className="flex flex-col items-center gap-2 py-8 text-center">
    <Icon className="size-8 text-sidebar-foreground/20" />
    <p className="text-xs text-sidebar-foreground/40">Empty headline.</p>
    <p className="text-xs text-sidebar-foreground/30">Helpful next step.</p>
  </div>
)}

{state.status === 'ready' && items.map(...)}
```

For dashed empty containers (small, in-line):

```tsx
<p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
  Nothing here.
</p>
```

## Sizes & spacing

- **Avatars:** `size-8` (user menu), `size-7` (org rows in dialog), `size-4` (org chip in sidebar group header). Always `rounded-md` for orgs (square-ish), default round for people.
- **Icons:** `size-3` (lock indicator), `size-3.5` (most inline icons), `size-4` (button icons), `size-5` (brand). Stick to these — don't introduce new sizes.
- **Gaps:** `gap-0.5` (tight stacks), `gap-1` (icon button group), `gap-2` / `gap-2.5` (item internals), `gap-3` (avatar+text rows), `gap-4` (sections).
- **Padding inside sidebar:** `px-4` for full-width section rows, `px-2` for nav with items, `px-2.5 py-2` (or `py-1.5` for tighter) for clickable items.
- **Padding inside dialog:** `px-5 pt-5 pb-3` for header, `px-5 pb-4` for body.

## Lucide icon vocabulary

Use these consistently — don't pick alternatives:

| Concept | Icon |
|---|---|
| Repository | `GitFork` |
| Pull request / app brand | `GitPullRequest` |
| Organization / company | `Building2` |
| Private repo | `Lock` |
| Sidebar minimize | `PanelLeftClose` |
| Sidebar expand | `PanelLeftOpen` |
| Collapsible toggle | `ChevronRight` (with rotate-90) |
| Add | `Plus` |
| Remove | `X` |
| Settings | `Settings` |
| Refresh | `RefreshCw` |
| External link | `ExternalLink` |
| Confirm | `Check` |
| Loading | `Loader2` (with `animate-spin`) |
| Sign out | `LogOut` |
| Search | `Search` |

`Github` icon does NOT exist in current Lucide; use `ExternalLink` for "open in GitHub" affordances.

## Don'ts

- Don't use raw colors (`bg-zinc-800`, `text-gray-500`). Always use tokens.
- Don't mix `sidebar-*` tokens with main `foreground`/`background` tokens in the same component.
- Don't add light-mode styles. Dark only.
- Don't introduce a new icon when a listed one fits.
- Don't change sidebar widths — 288/56. Don't transition `padding` or `opacity` on the aside (only `width`).
- Don't put descriptions under sidebar repo items. One line per item — descriptions go in the dialog.
- Don't forget the four states (loading/error/empty/ready) on any list view.
- Don't add a comment explaining a Tailwind class.
