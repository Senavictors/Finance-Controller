# Insights Automaticos

## Objetivo

Gerar insights automaticos, deterministas e uteis a partir dos dados do usuario, sem depender de IA generativa.

O foco e fazer o sistema parecer inteligente usando comparacao entre periodos, heuristicas claras e mensagens acionaveis.

## Dependencia

Depende da fundacao documentada em [Phase 8 - Foundation for Analytics and Credit Card Billing](../tasks/phase-8-analytics-foundation-and-credit-card-billing.md) e da decisao em [ADR-008](../decisions/ADR-008-credit-card-billing-cycle.md).

## Leitura do sistema atual

- O projeto ja calcula variacao de receitas e despesas entre meses.
- O dashboard ja exibe gastos por categoria, saldo por conta e transacoes recentes.
- O hook de periodo mensal e consistente no frontend.
- Recorrencias e categorias hierarquicas fornecem sinais importantes para alertas e comparacoes.
- Ainda nao existe um feed de insights, historico ou mecanismo de dismiss.

## Principio central

Insight bom precisa ser:

- especifico
- acionavel
- baseado em regra clara
- filtrado para evitar ruido

## Recomendacao arquitetural

Essa feature deve ser organizada como um motor de regras:

1. construir metricas do periodo
2. aplicar regras heuristicas
3. deduplicar resultados
4. persistir ou cachear
5. exibir em dashboard e paginas futuras

O modulo pode viver em `src/server/modules/finance/application/insights/`.

## Modelo recomendado

```prisma
enum InsightSeverity {
  INFO
  WARNING
  CRITICAL
}

model InsightSnapshot {
  id           String          @id @default(cuid())
  userId       String          @map("user_id")
  key          String
  title        String
  body         String
  severity     InsightSeverity
  scopeType    String          @map("scope_type")
  scopeId      String?         @map("scope_id")
  payload      Json
  periodStart  DateTime        @map("period_start")
  periodEnd    DateTime        @map("period_end")
  fingerprint  String
  isDismissed  Boolean         @default(false) @map("is_dismissed")
  createdAt    DateTime        @default(now()) @map("created_at")
}
```

## Heuristicas recomendadas para o MVP

- Aumento de gasto por categoria:
  - se o gasto atual for maior que `20%` do periodo anterior e a diferenca absoluta passar de um piso em centavos.
- Concentração excessiva:
  - se uma categoria representar mais de `X%` das despesas do mes.
- Meta em risco:
  - se uma meta atingir `warningPercent` ou `dangerPercent`.
- Saldo previsto negativo:
  - se o Forecast Engine projetar fechamento abaixo de zero.
- Fatura proxima do vencimento:
  - se houver fatura aberta com vencimento proximo e pagamento insuficiente.
- Uso alto do limite:
  - se a fatura aberta consumir uma faixa alta do `creditLimit`.
- Queda de taxa de economia:
  - se a poupanca do mes cair versus a media recente.
- Dependencia alta de cartao:
  - se utilizacao de limite e dependencia de pagamento no cartao ultrapassarem um percentual saudavel da renda.

## Exemplos de mensagens

- `Seus gastos com Alimentacao subiram 32% em relacao ao mes passado.`
- `Voce ja consumiu 91% do limite definido para Alimentacao.`
- `Mantendo o ritmo atual, seu saldo pode fechar negativo neste mes.`
- `Uma unica categoria responde por 44% das suas despesas atuais.`

## Regras de qualidade

- Toda regra precisa ter threshold percentual e threshold absoluto, para evitar alerta por variacao irrelevante.
- O sistema deve limitar quantidade de insights exibidos por periodo.
- Insights repetidos devem compartilhar `fingerprint` para evitar duplicacao no mesmo mes.
- `TRANSFER` deve ser excluido.

## API recomendada

- `GET /api/analytics/insights?month=2026-04`
- `POST /api/analytics/insights/recalculate?month=2026-04`
- `PATCH /api/analytics/insights/[id]/dismiss`

## UI recomendada

- Widget `insights` no dashboard com 3 a 5 itens prioritarios.
- Badges por severidade.
- CTA curto por insight:
  - `Ver categoria`
  - `Abrir metas`
  - `Ver forecast`

## Relacao com as outras features

- Goal Engine fornece alertas mais concretos e personalizaveis.
- Forecast Engine produz insights prospectivos, nao apenas retroativos.
- Score Financeiro pode reutilizar os mesmos fatores para justificar subida ou queda da nota.

## Ponto de integracao no codigo atual

- `src/app/api/analytics/summary/route.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/widgets/registry.ts`
- `src/hooks/use-period.ts`
- `prisma/schema.prisma`

## Ordem recomendada de implementacao

1. Consolidar metricas analiticas compartilhadas.
2. Criar conjunto pequeno de heuristicas de alta confianca.
3. Persistir `InsightSnapshot` com deduplicacao por fingerprint.
4. Expor endpoint mensal.
5. Adicionar widget no dashboard.
6. Permitir dismiss e historico.

## Riscos e cuidados

- Nao gerar insights demais. Ruido reduz valor percebido.
- Nao usar linguagem vaga ou dramatica. O texto precisa ser objetivo.
- Nao depender de IA para redacao. Templates deterministas sao suficientes e melhores para auditoria.

## Valor para portfolio

Essa feature tem cara de produto inteligente sem exigir stack de IA. Ela demonstra boa leitura de dados, pensamento de UX e capacidade de construir um motor de regras util e escalavel.
