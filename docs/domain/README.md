# Domínio

Linguagem, entidades, invariantes e regras de negócio do Finance Controller 2.0. Convenção de frontmatter (`estado`/`fonte`/`ultima-revisao`) em [`../README.md`](../README.md).

## Regras que atravessam o domínio

- Valores em centavos inteiros; datas de calendário ao meio-dia UTC (ADR-002).
- O saldo vem do ledger; `AccountBalance` é cache derivado e reconciliável (ADR-019).
- Futuro é dado: recorrências, parcelas, faturas e renda são lançamentos PLANNED que casam com os reais (ADR-020).
- Transferência é um par de lançamentos ligados (ADR-004); ciclo de fatura por mês de vencimento (ADR-008).
- Fórmulas das engines (Disponível, Flex, renda MEI, modo Aperto): `../product/especificacao-fc2.md` §5.

## Legado 1.x (referência)

Documentos do 1.x movidos para cá; descrevem o comportamento antigo e serão reavaliados na F6 ou descartados:

- [`goals.md`](goals.md) — metas do 1.x
- [`forecast.md`](forecast.md) — previsão do 1.x (substituída pela engine Disponível)
- [`financial-score.md`](financial-score.md) — score financeiro do 1.x
- [`insights.md`](insights.md) — insights do 1.x

## Implementados do 2.0

- [`categories.md`](categories.md) — categorias padrão BR, natureza Must/Need/Want e chaves de sistema (F1-07)

## Planejados do 2.0 (nascem sob demanda, por módulo)

Cada um é criado pela task que implementa o módulo correspondente:

- `glossary.md` — linguagem compartilhada (ciclo de renda, caixa x flex, Aperto, outstanding)
- [`ledger.md`](ledger.md) — status, kinds, saldo, cheque especial, transferências (F1-01, feito; reconciliação: F1-04)
- `cartoes.md` — ciclo de fatura, parcelas, estorno (F1-03)
- `dividas.md` — Price, juros, ordem por taxa (F1-05)
- `renda-mei.md` — base + dia presencial, DAS, teto anual (F1-06)
- `captura.md` — sintaxe do parser e Draft (F2-01)
- `recorrencias.md` — RRULE, PLANNED, matching (F3-01)
- `orcamento-flex.md` — 3 baldes, ritmo (F3-03)
- `disponivel.md` — modos Normal e Aperto (F3-02)
- `importacao.md` — lote, hash, Inbox (F4-01)
- `regras-categorizacao.md` — regras, merchants, camadas (F4-03)
