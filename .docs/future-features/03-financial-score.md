# Score Financeiro Pessoal

## Objetivo

Criar um indicador sintetico, explicavel e visualmente forte para representar a saude financeira do usuario em uma escala de `0 a 100`, com justificativas transparentes e historico mensal.

## Dependencia

Depende da fundacao documentada em [Phase 8 - Foundation for Analytics and Credit Card Billing](../tasks/phase-8-analytics-foundation-and-credit-card-billing.md) e da decisao em [ADR-008](../decisions/ADR-008-credit-card-billing-cycle.md).

## Leitura do sistema atual

- O sistema ja tem dados suficientes para um score inicial: receitas, despesas, contas, categorias, recorrencias e comparacao entre periodos.
- O dashboard atual favorece muito bem a exibicao de um card hero, badge de status e widgets complementares.
- O projeto ainda nao possui metas implementadas, mas esta feature ganha muito valor quando combinada com o Goal Engine.
- A qualidade do score melhora bastante quando o dominio de cartao usa limite, fechamento e vencimento reais.

## Principio central

O score precisa ser explicavel. Nada de numero magico.

Cada nota deve ser a soma de fatores claros, com pesos definidos e mensagens que respondam:

- o que ajudou a nota
- o que piorou a nota
- o que fazer para subir no proximo periodo

## Modelo recomendado

```prisma
model FinancialScoreSnapshot {
  id           String   @id @default(cuid())
  userId       String   @map("user_id")
  periodStart  DateTime @map("period_start")
  periodEnd    DateTime @map("period_end")
  score        Int
  status       String
  factors      Json
  insights     Json
  calculatedAt DateTime @default(now()) @map("calculated_at")
}
```

`factors` deve guardar uma estrutura explicavel, por exemplo:

```json
[
  {
    "key": "savings_rate",
    "weight": 30,
    "points": 22,
    "label": "Taxa de economia",
    "reason": "Voce poupou 18% da sua renda no mes"
  }
]
```

## Fatores recomendados para o MVP

- Taxa de economia no periodo.
- Estabilidade de gastos em relacao aos meses anteriores.
- Consistencia de renda.
- Uso de cartao de credito.
- Cumprimento de metas, quando Goal Engine existir.

## Pesos sugeridos

- `30` pontos para taxa de economia.
- `20` pontos para estabilidade de gastos.
- `15` pontos para consistencia de renda.
- `15` pontos para uso de cartao.
- `20` pontos para metas.

## Tratamento das limitacoes atuais

- Se o usuario ainda nao tiver metas, redistribuir esse peso para os demais fatores ou assumir pontuacao neutra. O score nao deve punir configuracao ausente.
- Uso de cartao deve preferir utilizacao real de limite e comportamento de pagamento de fatura, e nao apenas proporcao simples de gastos em contas `CREDIT_CARD`.
- `TRANSFER` nao entra no score.

## Faixas de status sugeridas

- `0-39`: Critico
- `40-59`: Em atencao
- `60-79`: Bom
- `80-100`: Excelente

## Use cases recomendados

- `calculateFinancialScore`
- `getFinancialScoreHistory`
- `refreshFinancialScoreSnapshot`

## API recomendada

- `GET /api/analytics/score?month=2026-04`
- `GET /api/analytics/score/history`

## UI recomendada

- Widget de score com numero grande, status e delta vs mes anterior.
- Breakdown de fatores em formato de lista ou accordion.
- Trend chart simples com score dos ultimos meses.
- CTA contextual com recomendacoes curtas:
  - `Seu score caiu por aumento de gastos variaveis`
  - `Cumprir a meta de economia pode adicionar 8 pontos`

## Relacao com outras features

- Goal Engine aumenta muito a credibilidade do score.
- Forecast Engine ajuda a transformar score em acao futura, nao apenas leitura do passado.
- Insights automaticos podem nascer diretamente dos fatores com menor pontuacao.

## Ponto de integracao no codigo atual

- `src/app/api/analytics/summary/route.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/widgets/registry.ts`
- `src/hooks/use-period.ts`
- `prisma/schema.prisma`

## Ordem recomendada de implementacao

1. Entregar Goal Engine ou, no minimo, desenhar compatibilidade com ele.
2. Criar `FinancialScoreSnapshot`.
3. Implementar calculo com fatores explicaveis e pesos versionados.
4. Expor API mensal e historica.
5. Adicionar widget de score e bloco de explicacao.
6. Conectar os menores fatores a insights acionaveis.

## Riscos e cuidados

- Nao transformar score em credit score. Ele deve representar organizacao financeira interna do usuario.
- Nao esconder a formula. Transparencia e o que torna a feature forte.
- Garantir que o fator de cartao seja baseado em utilizacao e pagamento real de fatura, nao em heuristica vaga.

## Valor para portfolio

Essa feature tem forte impacto visual e excelente narrativa de produto. Ela mostra capacidade de unir modelagem financeira, UX, explicabilidade e gamificacao sem depender de IA generativa.
