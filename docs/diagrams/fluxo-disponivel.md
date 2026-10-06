---
estado: planejado
fonte: docs/product/especificacao-fc2.md (§4.1, §5.1); ADR-021, ADR-022, ADR-029
ultima-revisao: bootstrap-init 2026-10-05
---

# Fluxo do cálculo "Disponível"

- **Propósito:** como a engine Disponível transforma saldos, previstos e flex em modo, valor livre e R$/dia. Funções puras; fórmulas na especificação §5.1.
- **status:** rascunho
- **Relacionados:** [`../architecture/components.md`](../architecture/components.md)

## Fluxo principal

```mermaid
flowchart TD
  A[Entradas: saldos das contas, limites, PLANNED, faturas, flex do ciclo] --> B[Define ciclo: mes calendario ou ciclo de renda]
  B --> C[caixaFimCiclo = saldo + entradas previstas - faturas - fixas, DAS e parcelas pendentes]
  B --> D[devidoAntes = itens com vencimento antes da proxima renda]
  D --> E[disponivelAgora = saldo + limite do cheque especial]
  E --> F[falta = max 0 de devidoAntes menos disponivelAgora, mais descoberto]
  F --> G{rendaPendente e falta maior que 0?}
  G -- sim --> H[Modo APERTO: Falta ate o salario, lista do que vence, saldo projetado dia a dia]
  G -- nao --> I[Modo NORMAL]
  C --> I
  I --> J[livre = min de flex menos gastoFlex, caixaFimCiclo menos colchao]
  J --> K[porDia = livre / dias restantes]
  J --> L[ritmo = gastoFlex / flex x diaAtual / diasNoCiclo]
  K --> M[Hoje: Livre para gastar ate o fim do ciclo]
  L --> M
  H --> N[Hoje: aura quente]
  M --> O[Hoje: aura calma ou tensa conforme ritmo]
```

## Sequência de uma abertura do app

```mermaid
sequenceDiagram
  actor U as Usuario
  participant P as Pagina Hoje (Server Component)
  participant B as budget (Disponivel)
  participant L as ledger
  participant R as recurring e income
  participant D as debts e cards
  participant DB as Postgres

  U->>P: abre o app
  P->>B: getDisponivel(userId, hoje)
  B->>L: saldos e limite por conta
  L->>DB: leitura (AccountBalance, Transaction)
  B->>R: previstos e renda do ciclo
  B->>D: faturas e parcelas que vencem
  B->>B: calcula modo, livre, porDia, ritmo, serie de caixa
  B-->>P: resultado
  P-->>U: hero com aura e lista "vence em breve"
```

## Estado atual (1.x)

Não existe esta engine. `application/forecast/calculate-forecast.ts` projeta receita menos despesa sem tratar faturas e transferências, e o "resumo do mês" em `application/analytics/monthly-summary.ts` soma só o mês corrente e ignora transferências. O forecast fica fora do layout principal. Documento legado: [`../architecture/flows.md`](../architecture/flows.md).
