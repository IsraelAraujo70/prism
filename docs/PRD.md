# PRD — [PRISM] (PR Viewer Desktop)

> **Status:** Draft v0.1
> **Autor:** Israel
> **Última atualização:** 2026-04-27

---

## 1. Visão geral

Um app desktop leve, multiplataforma (Windows/macOS/Linux), construído com **Tauri**, que centraliza o acompanhamento de Pull Requests do GitHub. Foco em **velocidade de contexto**: saber o que precisa da sua atenção, agora, sem abrir o navegador.

**Em uma frase:** "Um cliente desktop nativo de PRs que vive na sua bandeja e te avisa só do que importa."

---

## 2. Problema

Desenvolvedores que trabalham com revisão de código no GitHub sofrem com:

- **Fragmentação de contexto:** PRs espalhados entre vários repos e orgs, difícil ter visão consolidada.
- **Notificações ruins:** o e-mail do GitHub é ruidoso; a aba "Notifications" do site exige checagem manual.
- **Contexto perdido em CI:** descobrir que um check falhou exige clicar em vários lugares.
- **Latência:** abrir o navegador, logar, navegar até o PR — fricção alta pra uma ação que se repete dezenas de vezes ao dia.

---

## 3. Público-alvo

- **Primário:** desenvolvedores de software que revisam e abrem PRs diariamente, especialmente em times com múltiplos repos ativos.
- **Secundário:** tech leads e engenheiros sêniores que precisam acompanhar PRs de várias squads.
- **Não é alvo (por enquanto):** product managers, designers, ou usuários que não fazem code review.

---

## 4. Objetivos e não-objetivos

### Objetivos
- Reduzir o tempo entre "alguém pediu meu review" e "estou olhando o diff" para **menos de 5 segundos**.
- Substituir 90% dos casos de uso de revisão de PR no navegador.
- Funcionar bem com 50+ PRs ativos sem travar.
- Ser open-source, com código limpo o suficiente pra atrair contribuições.

### Não-objetivos (v1)
- Editar código no app (não somos uma IDE).
- Suportar GitLab/Bitbucket/Gitea (foco GitHub primeiro).
- Gerenciar issues, projects, ou discussions.
- Substituir CI/CD nativo — apenas exibir status.

---

## 5. Jornadas do usuário

### J1 — Onboarding
1. Usuário baixa e abre o app pela primeira vez.
2. Conecta sua conta GitHub via OAuth (ou Personal Access Token como fallback).
3. App lista repos/orgs disponíveis; usuário escolhe os que quer acompanhar.
4. Configura preferências básicas de notificação.
5. Cai na tela principal já com PRs carregados.

### J2 — Navegar entre projetos
1. Sidebar à esquerda lista repos favoritados (com badge de PRs aguardando review).
2. Usuário clica em um repo → painel central mostra lista de PRs.
3. Filtros disponíveis: **abertos**, **draft**, **meus PRs**, **aguardando meu review**, **fechados/merged**.

### J3 — Inspecionar um PR
1. Usuário clica em um PR da lista.
2. Painel de detalhe abre com tabs: **Conversation**, **Files Changed**, **Commits**, **Checks**.
3. Diff renderizado com syntax highlighting; toggle entre side-by-side e unified.
4. Tab **Checks** mostra status do GitHub Actions com link para logs em caso de falha.

### J4 — Agir em um PR
1. Comentar (geral ou inline em uma linha do diff).
2. Aprovar / Request changes / Comment review.
3. Re-request review de alguém.
4. Marcar PR como draft ou ready for review.
5. Fazer merge (quando autorizado).

### J5 — Receber notificações
1. App roda em background (tray icon).
2. Notificação nativa do SO dispara quando:
   - Alguém pede seu review.
   - Alguém revisa seu PR (aprovação ou changes).
   - Comentam no seu PR ou te mencionam.
   - CI falha em PR seu.
   - PR seu é merged ou fechado.
3. Clicar na notificação abre o app diretamente no PR relevante.

### J6 — Configurar
1. Granularidade de notificações por repo e por tipo de evento.
2. Tema claro/escuro/sistema.
3. Atalhos de teclado.
4. Iniciar com o sistema (opcional).

---

## 6. Requisitos funcionais

### 6.1 Autenticação
- **RF-1.1** Suportar OAuth GitHub (App + Device Flow).
- **RF-1.2** Suportar Personal Access Token como fallback.
- **RF-1.3** Suportar múltiplas contas simultâneas (ex: trabalho + pessoal).
- **RF-1.4** Armazenar tokens de forma segura usando o keychain do SO.

### 6.2 Sidebar de projetos
- **RF-2.1** Listar repos selecionados pelo usuário.
- **RF-2.2** Mostrar badge com contagem de PRs aguardando review do usuário.
- **RF-2.3** Permitir reordenar (drag & drop) e agrupar por org.
- **RF-2.4** Adicionar/remover repos via botão "+" ou search.

### 6.3 Lista de PRs
- **RF-3.1** Exibir PRs do repo selecionado com: título, autor, status, reviewers, checks, idade.
- **RF-3.2** Filtros: abertos, draft, meus, aguardando meu review, fechados.
- **RF-3.3** Busca por título, autor ou número.
- **RF-3.4** Quick switcher global (Cmd/Ctrl+K) para pular entre PRs.

### 6.4 Detalhe do PR
- **RF-4.1** Renderizar diff com syntax highlighting (toggle unified/split).
- **RF-4.2** Exibir thread de conversation, incluindo comentários inline.
- **RF-4.3** Exibir checks do GitHub Actions com:
  - Status agregado (passing/failing/pending).
  - Lista de jobs com status individual.
  - Link/visualização de logs quando falha.
- **RF-4.4** Listar reviewers e status (pending, approved, changes requested).
- **RF-4.5** Mostrar commits e issues linkadas.

### 6.5 Ações
- **RF-5.1** Comentar (geral e inline).
- **RF-5.2** Submeter review (approve / request changes / comment).
- **RF-5.3** Re-request review.
- **RF-5.4** Toggle draft/ready.
- **RF-5.5** Merge (quando o usuário tem permissão e checks passam).

### 6.6 Notificações
- **RF-6.1** Notificação pop nativa para os 5 eventos da J5.
- **RF-6.2** Click na notificação faz deep link para o PR.
- **RF-6.3** Badge no ícone do app/tray com contagem de pendências.
- **RF-6.4** Configuração granular por repo e por tipo de evento.

### 6.7 Sincronização
- **RF-7.1** Polling configurável (padrão: 60s) para repos acompanhados.
- **RF-7.2** Cache local para abertura instantânea.
- **RF-7.3** Indicador visual de "última sincronização".

---

## 7. Requisitos não-funcionais

| Categoria | Requisito |
|---|---|
| **Performance** | Abertura do app < 1s. Navegação entre PRs < 200ms. |
| **Memória** | < 200MB com 50 PRs carregados. |
| **Plataformas** | macOS 12+, Windows 10+, Linux (deb + AppImage). |
| **Acessibilidade** | Navegação completa por teclado. Contraste WCAG AA. |
| **Privacidade** | Tokens só no keychain. Sem telemetria por padrão. |
| **Internacionalização** | i18n desde o início (PT-BR e EN no v1). |

---

## 8. Considerações técnicas

- **Stack:** Tauri (Rust backend) + frontend a definir (sugestão: React/Solid/Svelte).
- **API GitHub:** GraphQL preferencialmente (1 query traz mais dados, melhor uso do rate limit).
- **Rate limiting:** respeitar `X-RateLimit-Remaining`; usar conditional requests (ETags) onde possível.
- **Webhooks vs polling:** polling no v1 (mais simples). Webhooks via GitHub App em v2.
- **GitHub Actions logs:** carregar sob demanda — são pesados.
- **Notificações:** `tauri-plugin-notification`. Deep link via custom protocol handler (`prviewer://pr/owner/repo/123`).
- **Persistência local:** SQLite via `sqlx` ou `rusqlite` para cache de PRs.

---

## 9. Escopo do MVP vs. v2+

### MVP (v0.1)
- Auth via PAT (OAuth fica para depois).
- Sidebar com repos.
- Lista e detalhe de PRs (read-only).
- Status de checks do GitHub Actions.
- Notificações para "review requested" e "review submitted".
- Tema claro/escuro.

### v0.2
- Comentar e submeter reviews.
- Múltiplas contas.
- Deep link nas notificações.
- Quick switcher (Cmd+K).

### v1.0
- OAuth flow completo.
- Merge via app.
- Configuração granular de notificações.
- Logs de Actions clicáveis.

### Futuro (v2+)
- Webhooks via GitHub App.
- Suporte a GitLab/Gitea.
- Atalhos customizáveis.
- Plugins/extensões.

---

## 10. Métricas de sucesso

- **Adoção:** 1.000 stars no GitHub em 6 meses; 100 usuários ativos diários.
- **Engajamento:** mediana de 10+ aberturas do app por dia ativo.
- **Qualidade:** crash-free rate > 99.5%.
- **Comunidade:** ao menos 5 contribuidores externos com PRs merged em 6 meses.

---

## 11. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Rate limit do GitHub | Alto | GraphQL + ETags + polling adaptativo |
| Complexidade do diff renderer | Médio | Reusar libs maduras (ex: `diff2html`, Monaco) |
| Notificações inconsistentes entre SOs | Médio | Testes em todos os 3 SOs desde o início |
| Bundle size do Tauri ficar grande | Baixo | Tauri já é enxuto por design; auditar deps |

---

## 12. Perguntas em aberto

- [ ] OAuth próprio (precisa registrar GitHub App) ou apenas PAT no MVP?
- [ ] Suportar GitHub Enterprise no v1 ou só github.com?
- [ ] Licença open-source: MIT, Apache 2.0, ou GPL?
- [ ] Distribuição: GitHub Releases apenas, ou também Homebrew/Winget/Flathub?
- [ ] Builds de release assinados (custo de cert no macOS)?

---

## 13. Referências

- [Tauri Docs](https://tauri.app)
- [GitHub GraphQL API](https://docs.github.com/en/graphql)
- [tauri-plugin-notification](https://github.com/tauri-apps/plugins-workspace)
- Apps similares para inspiração: [PullNotifier](https://www.pullnotifier.com), [Trex](https://github.com/jakemmarsh/trex), [Pullp](https://pullp.io)
