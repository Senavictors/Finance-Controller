# Contexto Atual do Projeto — Finance Controller 2.0

Última atualização: 2026-10-05

## Estado atual

O Finance Controller 1.x (Next.js 16, Prisma 7, PostgreSQL/Neon, Tailwind v4, commit `5cfb2c9`, fases 8 a 41) está funcional, mas o dono parou de usá-lo porque a usabilidade é cansativa: lançar exige formulário longo, o saldo por conta está errado (soma só o mês e ignora transferências), não existe "quanto posso gastar", recorrências dependem de um botão "Aplicar" e não há importação.

Em 2026-10-05 foi decidida a **reescrita completa para o FC 2.0** no mesmo repositório (ADR-016), com banco Neon descartável, uso exclusivamente pessoal (single-user), PWA mobile-first para iPhone 13 Pro, design "dark glass" (ADR-018), Telegram e IA (OpenAI, crédito total de US$ 5). A arquitetura de agentes (bootstrap) foi inicializada nesta data, e a documentação de `.docs/` foi migrada para `.agents/` e `docs/`.

Branch de trabalho: `main`. Nenhuma task do 2.0 iniciada.

## Iniciativas ativas

- **Finance Controller 2.0** — fases F0 a F7 planejadas em `PLANS.md`; 44 tasks em `.agents/tasks/backlog/`; especificação em `docs/product/especificacao-fc2.md`. Próximo passo: `executar fase F0` (orquestrador Opus + subagentes Sonnet, skill `.claude/skills/executar-fase/`).

## Arquitetura vigente

- **Hoje (1.x)**: Route Handlers com bastante Prisma direto; use-cases parciais em `src/server/modules/finance/application/`; `domain/` e `infra/` vazios; auth própria em `src/server/auth/`; sem cron; dashboard drag-and-drop como home.
- **Alvo (2.0)**: módulos em `src/server/modules/<modulo>/{domain,application,infra,http}`, tools únicas para UI/bot/MCP (ADR-025), Vercel Cron (ADR-030). Detalhe em `docs/architecture/` e papéis em `.claude/agents/`.

## Restrições importantes

- Constituição em `.agents/test-onboarding.md`: dados financeiros reais fora do Git; design system único (tokens `--fc-*`).
- O banco Neon atual pode ser zerado (autorizado pelo dono em 2026-10-05), mas a operação exige confirmação na hora pelo papel `dados-prisma`.
- `npm run build` executa `prisma migrate deploy`; para validar build use `npx next build`.
- Orçamento de IA: US$ 5 no total; teto mensal padrão de US$ 1 (ADR-026).
- Renda do dono como MEI: o sistema precisa acompanhar o teto anual do MEI (ADR-029).

## Dívida técnica conhecida

- Legado no repositório local: `backend/`, `database/`, arquivos de Create React App em `src/` (`App.js`, `index.js`, `pages/`, `contexts/`…), coleções Postman, `start-api.*`, `MELHORIAS_FUTURAS.md`, `README_*.md` — remoção na FC2-F0-01.
- Bugs do 1.x documentados para não repetir: saldo por conta só do mês (`monthly-summary.ts`), recorrência pulando dia 29/30/31, estorno não abatendo fatura (`billing.ts`), `parseMoneyToCents` lendo "1.250,00" errado, forecast com dupla contagem, upload em `public/uploads` incompatível com serverless.
- `.gitignore` do 1.x ignorava `.claude/`; agora `.claude/` é versionado, exceto `settings.local.json`.
- Muitos arquivos aparecem modificados no Git local só por mudança de permissão (sincronização via OneDrive); considerar `git config core.fileMode false`.

## Decisões recentes

- ADR-016 a ADR-031 (2026-10-05), índice em `.agents/decisions/README.md`.
- ADRs do 1.x migrados com status revisado: 005, 006, 007, 010, 011 e 014 substituídos; 009, 012 e 013 descontinuados; 001, 002, 003, 004, 008 e 015 vigentes.

## Riscos atuais

- **Parsers de PDF frágeis** (layout dos bancos muda) — média probabilidade, alto impacto na F4. Mitigação: fixtures sintéticas por layout, calibração com arquivos em `private/`, fallback OFX/CSV.
- **Custo de IA** — baixa probabilidade de estourar com teto e kill switch (ADR-026).
- **Limites do plano Hobby da Vercel** (cron diário, 60 s por função, 4,5 MB de body) — jobs pequenos e idempotentes; upload até 4 MB.
- **Execução paralela de subagentes** gerando conflitos — ondas serializam arquivos críticos (ADR-031).

## Não fazer agora

- Open Finance/Pluggy (F7) e modo casal (F7).
- App nativo iOS; a PWA é suficiente.
- Reaproveitar score/insights do 1.x antes da F6.
