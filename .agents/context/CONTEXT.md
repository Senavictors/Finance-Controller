# Contexto Atual do Projeto — Finance Controller 2.0

Última atualização: 2026-10-06

## Estado atual

O Finance Controller 1.x (Next.js 16, Prisma 7, PostgreSQL/Neon, Tailwind v4, commit `5cfb2c9`, fases 8 a 41) está funcional, mas o dono parou de usá-lo porque a usabilidade é cansativa: lançar exige formulário longo, o saldo por conta está errado (soma só o mês e ignora transferências), não existe "quanto posso gastar", recorrências dependem de um botão "Aplicar" e não há importação.

Em 2026-10-05 foi decidida a **reescrita completa para o FC 2.0** no mesmo repositório (ADR-016), com banco Neon descartável, uso exclusivamente pessoal (single-user), PWA mobile-first para iPhone 13 Pro, design "dark glass" (ADR-018), Telegram e IA (OpenAI, crédito total de US$ 5). A arquitetura de agentes (bootstrap) foi inicializada nesta data, e a documentação de `.docs/` foi migrada para `.agents/` e `docs/`.

Branch de trabalho: `main` (sem push desde o bootstrap; tag local `fc-1.x-final` → `5cfb2c9`).

**F0 — Fundação: código concluído em 2026-10-06** (orquestrador Opus + subagentes Sonnet, worktrees isolados, QA obrigatório). Entregue: legado 1.x removido; schema Prisma 2.0 (29 modelos, 26 enums, migration única `init_fc2` com 5 CHECKs, validada em Postgres 16 local); tokens dark glass no Tailwind v4/shadcn com Geist; 18 primitivos em `src/components/fc/`; app shell com tab bar e PWA instalável; auth single-user (sessão 90 dias com hash, `src/proxy.ts`, rate limit atômico em banco, segredos de cron/Telegram/MCP); fundação de testes/CI com `guard:data` e guard de cores literais no pre-commit e no CI. Pendente: **FC2-F0-08** (reset do Neon e aplicação da migration — portão humano) e o teste em iPhone real.

## Iniciativas ativas

- **Finance Controller 2.0** — fases F0 a F7 em `PLANS.md`; especificação em `docs/product/especificacao-fc2.md`. F0 com código concluído; **F1 em execução** (FC2-F1-01 ledger e FC2-F1-07 categorias na onda 1). Skill `.claude/skills/executar-fase/`.

## Arquitetura vigente

- **Hoje (1.x)**: Route Handlers com bastante Prisma direto; use-cases parciais em `src/server/modules/finance/application/`; `domain/` e `infra/` vazios; auth própria em `src/server/auth/`; sem cron; dashboard drag-and-drop como home.
- **Implantado (F0)**: `src/proxy.ts` (Next 16 só detecta o proxy dentro de `src/` quando o app usa `src/app`; o `middleware.ts` da raiz do 1.x nunca rodava) com proteção por padrão; sessão em `src/server/auth/` (token SHA-256, 90 dias, renovação diária, rate limit atômico via `LoginAttempt`); `src/components/fc/` (primitivos) e `src/components/shell/` (AppShell, TabBar); `src/app/manifest.ts` + `public/icons/`; `tests/guards/` (`no-real-data`, `literal-colors`) rodando no `npm test`, no `guard:data` do pre-commit e no CI.
- **Alvo (2.0)**: módulos em `src/server/modules/<modulo>/{domain,application,infra,http}`, tools únicas para UI/bot/MCP (ADR-025), Vercel Cron (ADR-030). Detalhe em `docs/architecture/` e papéis em `.claude/agents/`.

## Restrições importantes

- Constituição em `.agents/test-onboarding.md`: dados financeiros reais fora do Git; design system único (tokens `--fc-*`).
- O banco Neon atual pode ser zerado (autorizado pelo dono em 2026-10-05), mas a operação exige confirmação na hora pelo papel `dados-prisma`.
- `npm run build` executa `prisma migrate deploy`; para validar build use `npx next build`.
- Orçamento de IA: US$ 5 no total; teto mensal padrão de US$ 1 (ADR-026).
- Renda do dono como MEI: o sistema precisa acompanhar o teto anual do MEI (ADR-029).

## Dívida técnica conhecida

- Legado CRA **não rastreado** ainda presente no checkout local do dono (`backend/` com `.env`, `src/App.js`, `src/pages/`, `src/contexts/`, Postman, `start-api.*`, `.eslintrc.json`...): fora do Git, mas quebra `lint`/`test`/`guard:data` na pasta principal. O orquestrador valida num worktree limpo (`.claude/worktrees/integracao`). Remoção depende do dono.
- Checkout Windows com `core.autocrlf=true`: `npm run format:check` falha localmente por CRLF (o CI em Linux passa; `.gitattributes` força LF). Normalização local descrita em `tests/README.md`.
- `src/lib/format.ts` com cobertura baixa (fora do limite de 80%, que vale só para `domain/`).
- Bugs do 1.x documentados para não repetir: saldo por conta só do mês (`monthly-summary.ts`), recorrência pulando dia 29/30/31, estorno não abatendo fatura (`billing.ts`), `parseMoneyToCents` lendo "1.250,00" errado, forecast com dupla contagem, upload em `public/uploads` incompatível com serverless.
- `core.fileMode false` e `core.hooksPath .githooks` configurados (2026-10-05).

## Decisões recentes

- ADR-016 a ADR-031 (2026-10-05), índice em `.agents/decisions/README.md`.
- F0 (2026-10-06, sem ADR novo): reset do Neon desmembrado em FC2-F0-08; guard de cores endurecido em FC2-F0-09; proxy em `src/proxy.ts`; segredos de integração validados já no proxy (defesa em profundidade); `/login` com cookie não redireciona no proxy (evita laço) — a página valida a sessão.
- ADRs do 1.x migrados com status revisado: 005, 006, 007, 010, 011 e 014 substituídos; 009, 012 e 013 descontinuados; 001, 002, 003, 004, 008 e 015 vigentes.

## Riscos atuais

- **Banco Neon ainda com schema 1.x** até a FC2-F0-08: a produção da Vercel (se publicada a partir de `main`) não funciona com o código 2.0 antes do reset. Não fazer push/deploy antes da F0-08.

- **Parsers de PDF frágeis** (layout dos bancos muda) — média probabilidade, alto impacto na F4. Mitigação: fixtures sintéticas por layout, calibração com arquivos em `private/`, fallback OFX/CSV.
- **Custo de IA** — baixa probabilidade de estourar com teto e kill switch (ADR-026).
- **Limites do plano Hobby da Vercel** (cron diário, 60 s por função, 4,5 MB de body) — jobs pequenos e idempotentes; upload até 4 MB.
- **Execução paralela de subagentes** gerando conflitos — ondas serializam arquivos críticos (ADR-031).

## Não fazer agora

- Open Finance/Pluggy (F7) e modo casal (F7).
- App nativo iOS; a PWA é suficiente.
- Reaproveitar score/insights do 1.x antes da F6.
