# Prism

> Um cliente desktop nativo de Pull Requests do GitHub que vive na sua bandeja e te avisa só do que importa.

**Status:** 🚧 Em desenvolvimento inicial (pré-MVP)

Prism é um app desktop leve e multiplataforma (Windows / macOS / Linux), construído com [Tauri](https://tauri.app), focado em reduzir a fricção do code review no GitHub. Centraliza PRs de múltiplos repos e orgs, mostra status de checks, e notifica nativamente apenas o que precisa da sua atenção.

## Por que Prism?

- **Contexto consolidado** — todos os seus PRs em um lugar, agrupados por repo.
- **Notificações que fazem sentido** — só sobre o que pede sua ação (reviews, mentions, CI quebrado).
- **Velocidade** — abertura < 1s, navegação entre PRs < 200ms.
- **Privacidade** — tokens no keychain do SO, sem telemetria por padrão.
- **Open source** — MIT.

## Roadmap

Veja o [PRD completo](docs/PRD.md) para escopo, jornadas e requisitos.

- **MVP (v0.1)** — Auth via PAT, lista/detalhe de PRs (read-only), status de checks, notificações básicas.
- **v0.2** — Submeter reviews, múltiplas contas, deep links, quick switcher.
- **v1.0** — OAuth completo, merge no app, configuração granular de notificações.

## Stack

- **Backend:** Rust + Tauri
- **Frontend:** a definir (React / Solid / Svelte)
- **API:** GitHub GraphQL
- **Cache:** SQLite

## Contribuindo

O projeto está nos primeiros dias. Issues, ideias e PRs são bem-vindos assim que o scaffold inicial estiver pronto.

## Licença

[MIT](LICENSE)
