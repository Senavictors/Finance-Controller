# Planos de Execução — Finance Controller 2.0

Arquivo versionado. Índice de `.agents/tasks/`. O estado real de cada task é a **pasta** em que o arquivo está (`backlog/` → `active/` → `completed/`). Esta tabela é atualizada pelo orquestrador ao abrir e fechar cada onda.

Especificação: `docs/product/especificacao-fc2.md` · Orquestração: `.claude/skills/executar-fase/SKILL.md` (ADR-031)

## Como executar

```text
claude                      # sessão principal já abre como orquestrador (Opus)
> executar fase F0          # a skill executar-fase monta as ondas pelo depends_on
```

Onda = conjunto de tasks sem dependência entre si dentro da fase, executadas em paralelo por subagentes Sonnet (worktrees isolados), revisadas pelo `qa-revisor` e integradas em sequência.

## Ativos
_(ver `.agents/tasks/active/`)_ — nenhum.

## Planejados

### F0 — Fundação
Saída: app abre no iPhone instalado como PWA, com as 4 abas vazias, tokens aplicados e banco novo.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F0-01 | Limpeza do legado (CRA, backend/, database/, Postman, demo, landing) | api-servidor | — | 1 |
| FC2-F0-03 | Tokens dark glass no Tailwind v4/shadcn + fontes | ui-design-system | — | 1 |
| FC2-F0-02 | Schema Prisma 2.0 do zero + reset do Neon + migration inicial | dados-prisma | F0-01 | 2 |
| FC2-F0-04 | Primitivos de UI dark glass | ui-design-system | F0-03 | 2 |
| FC2-F0-07 | Fundação de testes e CI (fixtures anonimizadas) | qa-revisor | F0-01 | 2 |
| FC2-F0-05 | App shell mobile-first + 5 destinos + PWA (iPhone 13 Pro) | telas-produto | F0-04 | 3 |
| FC2-F0-06 | Auth single-user com sessão longa renovável | api-servidor | F0-02 | 3 |

### F1 — Confiança
Saída: saldo de cada conta no app = saldo do banco; dívidas e renda modeladas.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F1-01 | Ledger + AccountBalance + transferências + cheque especial | dominio-financeiro | F0-02 | 1 |
| FC2-F1-07 | Categorias padrão BR + natureza Must/Need/Want | dados-prisma | F0-02 | 1 |
| FC2-F1-02 | Contas: CRUD, saldo real, uso do limite | api-servidor | F1-01 | 2 |
| FC2-F1-03 | Cartões: ciclo de fatura, compras/parcelas, pagamento, mover, estorno | dominio-financeiro | F1-01 | 2 |
| FC2-F1-05 | Dívidas: consignado (Price), cheque especial, rotativo, Pix no crédito | dominio-financeiro | F1-01 | 2 |
| FC2-F1-06 | Renda MEI: base + dia presencial, DAS, teto anual | dominio-financeiro | F1-01 | 2 |
| FC2-F1-04 | Reconciliação de saldo | api-servidor | F1-02 | 3 |

### F2 — Captura
Saída: lançar um gasto em menos de 5 segundos.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F2-01 | Parser quick-add pt-BR (domínio puro) | dominio-financeiro | F1-01 | 1 |
| FC2-F2-02 | Memória de merchant + defaults | dominio-financeiro | F2-01 | 2 |
| FC2-F2-03 | Use-case createFromDraft | api-servidor | F2-01, F1-03 | 2 |
| FC2-F2-04 | Sheet de captura global | telas-produto | F2-03, F0-05 | 3 |
| FC2-F2-05 | Tela Lançamentos | telas-produto | F2-03 | 3 |

### F3 — Hoje & Planejar
Saída: "quanto posso gastar" sem clicar; modo Aperto correto.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F3-01 | Recorrências (série + PLANNED + cron + matching + outstanding) | dominio-financeiro | F1-01 | 1 |
| FC2-F3-03 | Orçamento Flex em 3 baldes + watchlists | dominio-financeiro | F1-01 | 1 |
| FC2-F3-06 | Tela Cartões | telas-produto | F1-03 | 1 |
| FC2-F3-07 | Metas (Reserva, Prioridade, Desejo, Quitação) | api-servidor | F1-05 | 1 |
| FC2-F3-02 | Engine Disponível (ciclo de renda, caixa, flex, ritmo, Aperto) | dominio-financeiro | F3-01, F1-05, F1-06 | 2 |
| FC2-F3-05 | Tela Planejar | telas-produto | F3-03, F1-05 | 2 |
| FC2-F3-04 | Tela Hoje | telas-produto | F3-02, F0-05 | 3 |

### F4 — Importação & Inbox
Saída: fechar o mês importando extratos em cerca de 10 minutos.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F4-01 | Pipeline de importação + ImportBatch + importHash + OFX/CSV | ia-integracoes | F1-01 | 1 |
| FC2-F4-03 | Normalização de merchant + motor de regras | dominio-financeiro | F2-02 | 1 |
| FC2-F4-02 | Parsers PDF Itaú/Nubank (extrato e fatura) | ia-integracoes | F4-01 | 2 |
| FC2-F4-04 | Matching importado × previsto + transferência entre contas | dominio-financeiro | F3-01, F4-01 | 2 |
| FC2-F4-05 | Inbox de revisão | telas-produto | F4-03, F4-04 | 3 |
| FC2-F4-06 | Tela Importar | telas-produto | F4-02 | 3 |

### F5 — IA, Telegram & MCP
Saída: ≥ 80% categorizado sem toque; bot lança e responde; custo ≤ US$ 1/mês.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F5-01 | Registro de tools (Zod) sobre os use-cases | api-servidor | F2-03 | 1 |
| FC2-F5-02 | Cliente OpenAI com orçamento e redaction | ia-integracoes | F0-02 | 1 |
| FC2-F5-03 | Categorização LLM few-shot + fallback do parser | ia-integracoes | F5-02, F4-03 | 2 |
| FC2-F5-04 | Bot Telegram | ia-integracoes | F5-01, F5-02 | 2 |
| FC2-F5-06 | Servidor MCP read-only | api-servidor | F5-01 | 2 |
| FC2-F5-05 | Agentes agendados (Vigia, Resumo, Fechamento) | ia-integracoes | F5-04, F3-02 | 3 |

### F6 — Polimento & hábito
Saída: Lighthouse PWA ok; uso em 5 de 7 dias.

| ID | Task | Papel | Depende de | Onda |
|---|---|---|---|---|
| FC2-F6-01 | Motion, gestos e performance 120 Hz + reduced motion | ui-design-system | F3-04 | 1 |
| FC2-F6-02 | Ritual, sequência, celebrações, privacy mode | telas-produto | F3-04, F4-05 | 1 |
| FC2-F6-03 | Relatórios (fluxo, categorias, Must/Need/Want, juros pagos) | telas-produto | F3-02 | 1 |
| FC2-F6-04 | Acessibilidade + auditoria visual + Lighthouse PWA | qa-revisor | F6-01, F6-02 | 2 |

### F7 — Futuro (backlog sem data)

| ID | Task | Papel | Depende de |
|---|---|---|---|
| FC2-F7-01 | Open Finance via Pluggy | ia-integracoes | F4-04 |
| FC2-F7-02 | Modo casal (household + permissões por conta) | api-servidor | F1-02 |

## Concluídos
_(ver `.agents/tasks/completed/`)_ — fases 8 a 41 do FC 1.x migradas como histórico (`legacy-*`).
