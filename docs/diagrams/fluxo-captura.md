---
estado: planejado
fonte: docs/product/especificacao-fc2.md (§4.3); ADR-024, ADR-025
ultima-revisao: bootstrap-init 2026-10-05
---

# Fluxo de captura

- **Propósito:** do gesto de captura ao lançamento salvo; inclui parser determinístico, memória de merchant, fallback de IA e destino em fatura de cartão.
- **status:** rascunho
- **Relacionados:** [`../architecture/components.md`](../architecture/components.md), [`../data/modelo-fc2.md`](../data/modelo-fc2.md)

## Fluxo principal

```mermaid
flowchart TD
  A[Gesto: FAB +, atalho / ou bot Telegram] --> B[Texto livre: uber 18 nubank]
  B --> C[Parser deterministico pt-BR]
  C --> D{Draft completo?}
  D -- sim --> E[Merchant e regras sugerem categoria e conta]
  D -- nao --> F{Orcamento de IA disponivel?}
  F -- sim --> G[Fallback OpenAI com redaction]
  F -- nao --> H[Chips pendentes para o usuario]
  G --> E
  H --> E
  E --> I[Chips editaveis: categoria, valor, conta, parcelas, data, tipo]
  I --> J{Conta e cartao?}
  J -- sim --> K[Calcula fatura de destino e se vence no ciclo atual]
  J -- nao --> L[Confirmar]
  K --> L
  L --> M[createFromDraft - use-case]
  M --> N[(Transaction + parcelas se houver)]
  N --> O[Recalcula Disponivel e atualiza cache de saldo]
```

## Sequência

```mermaid
sequenceDiagram
  actor U as Usuario
  participant UI as Sheet de captura
  participant API as Route Handler
  participant CAP as capture (parse)
  participant MER as merchants e rules
  participant UC as createFromDraft
  participant DB as Postgres

  U->>UI: digita "tv 2400 10x c6"
  UI->>API: POST draft (texto)
  API->>CAP: parseQuickAdd(texto)
  CAP-->>API: Draft tipado
  API->>MER: sugerir categoria e conta
  MER-->>API: Draft enriquecido (top 2 sugestoes)
  API-->>UI: chips + fatura de destino
  U->>UI: confirma
  UI->>API: POST createFromDraft
  API->>UC: executa (userId, draft)
  UC->>DB: Transaction + CardPurchase + CardInstallment
  DB-->>UC: ok
  UC-->>API: lancamento criado
  API-->>UI: sucesso (undo disponivel)
```

Nota: a mesma função `createFromDraft` atende UI, bot e MCP (ADR-025).

## Estado atual (1.x)

Não há captura global: lançar exige formulário em `/transactions` (2 digitações e 5 a 9 cliques) e a conta default é a primeira em ordem alfabética. A criação passa por `src/app/api/transactions/route.ts` com Prisma direto.
