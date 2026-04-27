import { ExternalLink, GitPullRequest } from 'lucide-react'
import { Button } from '@/components/ui/button'

function App() {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <GitPullRequest className="size-8 text-primary" />
        <h1 className="text-4xl font-semibold tracking-tight">Prism</h1>
      </div>

      <p className="max-w-md text-center text-muted-foreground">
        Cliente desktop nativo para Pull Requests do GitHub. Scaffold inicial
        pronto — Tauri + React + shadcn/ui.
      </p>

      <Button variant="default" size="lg" asChild>
        <a
          href="https://github.com/IsraelAraujo70/prism"
          target="_blank"
          rel="noreferrer"
          className="gap-2"
        >
          Repositório
          <ExternalLink className="size-4" />
        </a>
      </Button>
    </main>
  )
}

export default App
