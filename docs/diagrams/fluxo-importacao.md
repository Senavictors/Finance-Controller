---
estado: planejado
fonte: docs/product/especificacao-fc2.md (§4.2, §10 F4); ADR-023, ADR-024, ADR-020
ultima-revisao: bootstrap-init 2026-10-05
---

# Fluxo de importação de extratos

- **Propósito:** arquivo PDF/OFX/CSV até lançamentos confirmados, com deduplicação, matching e Inbox.
- **status:** rascunho
- **Privacidade:** arquivos reais ficam em `private/` (gitignored); fixtures de teste são sintéticas em `tests/fixtures/`.
- **Relacionados:** [`../data/modelo-fc2.md`](../data/modelo-fc2.md)

## Fluxo principal

```mermaid
flowchart TD
  A[Upload na tela Importar] --> B[Cria ImportBatch: PENDING]
  B --> C{Tipo do arquivo}
  C -- OFX/CSV --> D[Parser generico]
  C -- PDF --> E[Parser por emissor: Itau, Nubank - extrato ou fatura]
  D --> F[Linhas normalizadas]
  E --> F
  F --> G[Calcula importHash por linha]
  G --> H{importHash ja existe?}
  H -- sim --> I[Descarta como duplicado]
  H -- nao --> J[Normaliza merchant e aplica regras]
  J --> K{Casa com PLANNED?}
  K -- um candidato --> L[MATCHED: vira CLEARED]
  K -- ambiguo --> M[Inbox: NEEDS_REVIEW]
  K -- nenhum --> N{Par de transferencia entre contas?}
  N -- sim --> O[Liga como transferencia]
  N -- nao --> P[Nova transacao]
  P --> Q{Confianca da categoria alta?}
  Q -- sim --> R[REVIEWED]
  Q -- nao --> M
  L --> S[Atualiza contagens do ImportBatch]
  M --> S
  O --> S
  R --> S
  I --> S
  S --> T[ImportBatch: COMPLETED]
  T --> U[Usuario revisa o Inbox: swipe confirma ou adia]
```

## Sequência

```mermaid
sequenceDiagram
  actor U as Usuario
  participant UI as Tela Importar
  participant API as Route Handler
  participant IMP as imports
  participant MAT as recurring (matching)
  participant RUL as rules e merchants
  participant DB as Postgres

  U->>UI: envia arquivo
  UI->>API: POST import
  API->>IMP: importFile(userId, arquivo)
  IMP->>DB: cria ImportBatch
  IMP->>IMP: parse + importHash
  IMP->>DB: filtra hashes existentes
  IMP->>RUL: categorizar linhas novas
  IMP->>MAT: casar com PLANNED
  MAT-->>IMP: MATCHED, ambiguo ou nenhum
  IMP->>DB: grava Transaction (review conforme confianca)
  IMP->>DB: fecha ImportBatch com contagens
  API-->>UI: resumo (criadas, duplicadas, para revisar)
  U->>UI: revisa Inbox
```

## Estado atual (1.x)

Não existe importação: nenhum parser nem `ImportBatch`. Todos os lançamentos são manuais.
