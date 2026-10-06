---
estado: planejado
fonte: auditoria de mercado (out/2026), protótipos navegáveis FC 2.0 e decisões do dono do produto em 05/10/2026
ultima-revisao: bootstrap-init 2026-10-05
---

# Especificação mestre — Finance Controller 2.0

Documento de referência para todas as fases e tasks em `.agents/tasks/`. Quando uma task e este documento divergirem, a task vence para o seu escopo e este documento é atualizado por `bootstrap-complete`.

> **Constituição:** nenhum dado financeiro real (extratos, faturas, CPF, saldos, valores de salário, nomes de terceiros) entra neste repositório. Exemplos aqui usam valores fictícios ou fórmulas.

## 1. Por que reescrever

O FC 1.x tem bom backend (centavos, ciclo de fatura testado, parcelas como ledger 1:1, engines explicáveis), mas o dono parou de usar porque:

| Problema | Evidência no 1.x | Consequência |
|---|---|---|
| Lançar é caro | 2 digitações + 5–9 cliques; botão só em `/transactions`; conta default alfabética | Hábito não se forma |
| Saldo errado | `monthly-summary.ts` soma só o mês e ignora transferências | Usuário não confia |
| Não responde "quanto posso gastar" | forecast fora do layout, receita−despesa do mês, dupla contagem | Sem valor diário |
| Recorrência manual | botão "Aplicar", bug dia 29/30/31 | Dados incompletos |
| Sem importação | nenhum parser | Tudo manual |

**Decisão (ADR-016):** reescrita no mesmo repositório, banco zerado, reaproveitando só o que é bom (ver §9).

## 2. Usuário e contexto (sem dados reais)

- Uso **exclusivamente pessoal**, um único usuário. Mantemos `userId` nas tabelas por segurança, mas sem ambição SaaS/demo.
- Dispositivo principal: **iPhone 13 Pro** (viewport 390×844, notch, ProMotion 120 Hz), via **PWA** instalada pelo Safari. Desktop é secundário (layout expandido + atalhos de teclado).
- Perfil financeiro que o sistema precisa modelar bem:
  - Conta corrente com **cheque especial** frequentemente em uso (saldo negativo é cenário normal, não erro).
  - **Vários cartões** com ciclos diferentes (fechamento/vencimento distintos), limites baixos, uso de **Pix no crédito** e **limite convertido em saldo** (crédito caro).
  - **Empréstimos consignados** (sistema Price, parcela fixa, débito em conta) — às vezes com parcelas em atraso.
  - **Renda como MEI/PJ**: pagamento mensal em dia fixo, composto por **base + adicional por dia presencial** (dias da semana configuráveis). Recebe em conta PJ separada e transfere para PF. Paga **DAS MEI** mensal e precisa acompanhar o **teto anual do MEI**.
  - Contas fixas em débito automático (telefonia), assinaturas no cartão (inclusive em USD com IOF), boletos de cartão de loja.
- Bancos atuais: Itaú (conta + cartão), Nubank (conta PF, conta PJ, cartão), Mercado Pago (cartão). Formatos disponíveis: **PDF** de extrato/fatura (Itaú, Nubank); OFX/CSV quando o banco permitir.

## 3. Princípios de produto

1. **Resposta em 2 s** — abrir o app mostra um número e o que vence.
2. **Capturar em 5 s** — texto livre global ("uber 18 nubank").
3. **Automatizar e revisar** — importação → Inbox de confirmação, nunca formulário longo.
4. **Futuro é dado** — recorrências, parcelas, faturas e renda são lançamentos previstos que casam com os reais.
5. **Número que não mente** — saldo do ledger = saldo do banco (reconciliação); faturas e juros entram no cálculo.
6. **Planejamento leve** — Flex em 3 baldes, sem envelope obrigatório.
7. **Hábito saudável** — ritual diário de 30 s, inbox zero, sequência de dias; nada de dark patterns.

## 4. Arquitetura de informação

```text
TabBar (vidro, fixa)                         Captura global
├── Hoje        (home opinativa)              ├── FAB central "+"
├── Lançamentos (Todos | Inbox)               ├── atalho "/" ou ⌘K (desktop)
├── Planejar    (Flex, dívidas, metas)        └── bot Telegram
└── Cartões     (faturas, parcelas)
Mais: relatórios, contas, categorias, regras, importar, integrações, conta
```

### 4.1 Hoje
- **Hero com aura** (gradiente animado cuja cor reflete o estado: calmo / tenso / quente).
- **Dois modos** (ADR-021):
  - **Aperto** — quando o que vence antes da próxima renda não cabe em saldo + limite disponível. Mostra "Falta até o salário", lista do que vence antes, gráfico de **saldo projetado dia a dia** com faixa do limite do cheque especial.
  - **Normal** — "Livre para gastar até <fim do ciclo>", R$/dia, ritmo (linha ideal vs real) e "limite: flex | caixa".
- Ritual de hoje (anel 2 passos: revisar inbox, registrar gastos) + sequência semanal.
- Vence em breve (carrossel; atrasados destacados; renda com ação de confirmar recebimento).
- Caixa no fim do ciclo (saldo, entradas previstas, faturas, fixas/DAS/parcelas).
- Contas com saldo real e uso do cheque especial.

### 4.2 Lançamentos
- Lista agrupada por dia, busca instantânea, edição inline, undo.
- **Inbox**: pilha de cartões com swipe (direita confirma, esquerda adia), teclado na web (↑↓ X R), top-2 sugestões com explicação, match com recorrência/transferência, "criar regra" com preview retroativo.

### 4.3 Captura (sheet)
- Campo único com parser determinístico pt-BR; chips editáveis (categoria, valor, conta, parcelas, data, tipo).
- Para cartão: mostra **fatura de destino** e se vence no ciclo atual (impacta caixa) ou não (só flex).
- Presets de parcelas (à vista, 2, 3, 6, 10, 12×), "Salvar e outro", sugestões recentes.
- Sintaxe: `ifood 42,90 nubank`, `uber 18 ontem`, `tv 2400 10x c6`, `transf 500 pj → itau`, `salário 4000 pj`, `estorno 89 amazon`, `#tag`.

### 4.4 Planejar
- Renda do ciclo (base + adicional presencial calculado pelo calendário) e DAS.
- Barra de alocação: contas/assinaturas, parcelas de dívida, DAS, Flex, "para sair do vermelho / reserva".
- **Dívidas e juros** ordenadas por taxa (rotativo > cheque especial > Pix no crédito/limite convertido > consignado), com custo mensal em R$ e data prevista de quitação.
- Flex por categoria com marcador do dia; Watchlists; "Quanto custa a sua vida".
- Metas (Reserva, Prioridade, Desejo — a antiga wishlist vira tipo de meta).

### 4.5 Cartões
- Carrossel de cartões (gradiente por emissor), fatura atual (aberta/fechada, vence em N dias), pagar com a conta de maior saldo (avisa se vai usar cheque especial), próximas faturas com parte de parcelas, parcelas ativas, mover lançamento para outra fatura, estorno abatendo fatura.

## 5. Engines de domínio (funções puras, testadas)

| Engine | Entrada | Saída | ADR |
|---|---|---|---|
| Ledger/Saldo | transações por conta | cleared, pending, planned; uso do limite | 019 |
| Ciclo de fatura | compra, fechamento, vencimento | chave da fatura (mês de vencimento) | 008 (mantido) |
| Recorrência | série RRULE | ocorrências PLANNED até hoje+90d | 020 |
| Matching | transação nova × PLANNED | MATCHED / ambíguo→Inbox / OUTSTANDING | 020 |
| Disponível | saldos, limites, previstos, flex | modo, livre, R$/dia, ritmo, falta, série de caixa | 021 |
| Flex | gastos variáveis do ciclo | por categoria, % e ritmo | 022 |
| Parser quick-add | texto | Draft tipado | 024 |
| Categorização | descrição bruta | categoria + fonte + confiança | 024 |
| Dívidas | contratos/limites | saldo devedor, custo mensal, ordem por taxa | 028 |
| Renda MEI | regra de renda + calendário | valor previsto do ciclo; DAS; acumulado vs teto | 029 |

### 5.1 Fórmulas

```text
caixaFimCiclo = Σ saldo(contas)                       // pode ser negativo
              + Σ entradas previstas (renda, reembolsos)
              − Σ faturas que vencem no ciclo
              − Σ fixas/DAS/parcelas pendentes (inclui atrasadas)

livre  = min(flex − gastoFlex, caixaFimCiclo − colchão)
porDia = livre ÷ dias restantes
ritmo  = gastoFlex ÷ (flex × diaAtual ÷ diasNoCiclo)

// Modo Aperto (antes da próxima renda)
devidoAntes = Σ itens com vencimento < dataRenda
disponivelAgora = Σ saldo(contas) + Σ limite(cheque especial)
falta = max(0, devidoAntes − max(0, disponivelAgora)) + max(0, −disponivelAgora)
aperto = rendaPendente ∧ falta > 0

rendaPrevista(ciclo) = base + adicionalPorDia × diasPresenciais(calendário, diasDaSemana, feriados)
```

**Ciclo**: configurável — mês calendário ou **ciclo de renda** (do dia do pagamento até a véspera do próximo). Default para o dono: ciclo de renda.

## 6. Modelo de dados (resumo — detalhe em `docs/data/`)

Novas entidades e campos (schema escrito do zero, ADR-016):

- `Account` (CHECKING | SAVINGS | WALLET | INVESTMENT | CREDIT_CARD | BUSINESS) com `overdraftLimit`, `closingDay`, `dueDay`, `creditLimit`, `issuerKey`, `networkKey`, `isArchived`.
- `Transaction` com `status` (PLANNED | PENDING | CLEARED | RECONCILED), `review` (NEEDS_REVIEW | REVIEWED), `source` (MANUAL | QUICKADD | IMPORT | BOT | RECURRING | OPEN_FINANCE), `rawDescription`, `merchantId`, `importHash` (único por usuário), `seriesId`, `statementKey`, `categorySource`, `aiConfidence`, `userLocked Json`, `excludeFromBudget`, `kind` (EXPENSE | INCOME | TRANSFER | CARD_PAYMENT | FEE | INTEREST | ADJUSTMENT).
- `Merchant` (aliases, categoria padrão, últimas 3 categorias, natureza MUST/NEED/WANT).
- `RecurringSeries` (BILL | SUBSCRIPTION | INCOME | TRANSFER | LOAN_INSTALLMENT | TAX, `rrule`, tolerâncias, autoConfirm, materializedUntil).
- `IncomeRule` (base, adicionalPorDia, diasDaSemana, contaDestino, diaPagamento).
- `Loan` (CONSIGNADO | PERSONAL | OVERDRAFT | CARD_REFINANCE | PIX_CREDIT, principal, taxaMensal, parcelas, saldoDevedor, sistema PRICE) + `LoanInstallment`.
- `CreditCardStatement` (mantém lógica do 1.x), `CardPurchase` + `CardInstallment` (reaproveita 1.x).
- `BudgetCycle` (flexAmount, cushion) + `BudgetLine` (bucket FIXED | NON_MONTHLY | FLEX).
- `Rule` (conditions/actions JSON, stage, priority, origin USER | LEARNED, hits).
- `ImportBatch` (kind OFX | CSV | PDF_ITAU_EXTRATO | PDF_ITAU_FATURA | PDF_NUBANK_EXTRATO | PDF_NUBANK_FATURA, contagens, status).
- `Goal` (RESERVE | PRIORITY | WISH | DEBT_PAYOFF).
- `AccountBalance` (cache derivado), `Reconciliation`.
- `Memory`, `AgentRun`, `AiUsage` (custo por chamada), `TelegramLink` (chatId permitido).
- `MeiLedger` (receita acumulada no ano vs teto proporcional).

## 7. Integrações

| Integração | Uso | Restrições | ADR |
|---|---|---|---|
| Neon Postgres | banco | pode ser **zerado** (autorizado pelo dono em 05/10/2026) | 016 |
| Vercel | hosting + Cron (diário) | jobs idempotentes | 030 |
| OpenAI API | fallback do parser, categorização few-shot, chat, transcrição de áudio | **orçamento total US$5**: teto mensal configurável, `AiUsage` registra custo, modelos pequenos (gpt-5-nano / gpt-5-mini), nunca enviar CPF/conta/nomes de terceiros | 026 |
| Telegram Bot API | captura, consultas, alertas e agentes | webhook com secret token; aceita só o `chatId` cadastrado | 027 |
| MCP (read-only) | Claude/ChatGPT consultarem dados | escrita opt-in; mesmas tools | 025 |
| Open Finance (Pluggy) | futuro (F7) | custo; credenciais próprias | — |

## 8. Design (detalhe em `docs/ui/`)

Dark glass, mobile-first, iOS-like. Tokens em `src/styles/tokens.css` (ADR-018). Fonte do sistema Apple no iPhone com fallback Geist; números em SF Pro Rounded/Geist tabular. Motion com springs (`cubic-bezier(.2,.9,.25,1.12)`), respeitando `prefers-reduced-motion`. Haptics: Vibration API não funciona no Safari iOS — usar apenas feedback visual/sonoro discreto no iPhone.

Protótipos de referência (fora do repositório, por conterem dados): "Finance Controller 2.0" (dados de exemplo) e versão pessoal.

## 9. O que reaproveitar do 1.x

| Reaproveitar | Onde está no 1.x | Observação |
|---|---|---|
| `lib/money.ts` + testes | `src/lib/money.ts` | centavos, parse pt-BR |
| Ciclo de fatura | `application/credit-card/statement-cycle.ts` + testes | núcleo do ADR-008 |
| Parcelas e antecipação | `application/credit-card-purchases/` | adaptar ao novo schema |
| Transferência atômica | `api/transactions/transfer` | virar use-case |
| Registry de marcas | `src/lib/brands/` + `public/brands/` | ícones de bancos/serviços |
| Datas ao meio-dia UTC | `http/schemas.ts` | evita bug UTC-3 |
| Score/Insights | `application/score`, `insights` | reavaliar na F6; não bloqueia |

Descartar: CRA legado (`src/App.js`, `src/index.js`, `src/pages`, etc.), `backend/`, `database/`, coleções Postman, dashboard drag-and-drop (vira relatório opcional), seed/reset demo, landing de portfólio.

## 10. Fases

| Fase | Objetivo | Critério de saída |
|---|---|---|
| F0 Fundação | limpar legado, schema novo, tokens, shell PWA | app abre no iPhone instalado com as 4 abas vazias e tokens aplicados |
| F1 Confiança | ledger, contas, cartões, dívidas, renda MEI, reconciliação | saldo do app = saldo do banco |
| F2 Captura | parser, memória de merchant, sheet global, lista | lançar em < 5 s |
| F3 Hoje & Planejar | recorrências, engine Disponível, telas Hoje/Planejar/Cartões | "quanto posso gastar" sem clicar; modo Aperto correto |
| F4 Importação & Inbox | importadores PDF/OFX/CSV, regras, matching, Inbox | fechar o mês importando em ~10 min |
| F5 IA & Telegram | tools, OpenAI com orçamento, bot, agentes, MCP | 80% categorizado sem toque; bot lança e responde |
| F6 Polimento & hábito | motion, a11y, relatórios, ritual | Lighthouse PWA ok; 5/7 dias de uso |
| F7 Futuro | Open Finance, casal | — |

## 11. Métricas de sucesso

- Captura: mediana < 5 s do gesto ao salvar.
- Reconciliação: diferença R$ 0,00 por conta no fechamento.
- Automação: ≥ 80% das transações sem edição manual.
- Hábito: app aberto em 5 de 7 dias.
- Custo de IA: ≤ US$ 1/mês.
