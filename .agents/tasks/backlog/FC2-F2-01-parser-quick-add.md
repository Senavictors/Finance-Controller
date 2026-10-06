---
id: FC2-F2-01
title: Parser quick-add pt-BR (domínio puro)
status: backlog
type: feature
phase: F2
wave: 1
owner: dominio-financeiro
depends_on: [FC2-F1-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [capture]
related_use_cases: []
related_adrs: [ADR-002, ADR-024, ADR-025]
---

# FC2-F2-01 — Parser quick-add pt-BR (domínio puro)

## Contexto
A meta da F2 é "lançar em menos de 5 segundos" (spec §10 e §11). O gesto é: abrir a sheet global, digitar uma linha como `ifood 42,90 nubank` e salvar. Quem transforma essa linha em um lançamento estruturado é o parser quick-add, determinístico e sem rede (ADR-024, camada 0 da categorização). Ele roda no cliente (para os chips atualizarem a cada tecla, sem round-trip) e no servidor (bot Telegram da F5 e use-case `createFromDraft` da F2-03), por isso precisa ser uma função pura, sem Prisma, sem `Date.now()` implícito e sem acesso a rede.

Sintaxe de referência (spec §4.3): `ifood 42,90 nubank`, `uber 18 ontem`, `tv 2400 10x c6`, `transf 500 pj → itau`, `salário 4000 pj`, `estorno 89 amazon`, `#tag`.

## Problema
O 1.x não tem captura por texto. O único parser de valor existente é `parseMoneyToCents` em `src/lib/money.ts` (1.x), que é inadequado para pt-BR com milhar: ele faz `trimmed.replace(/\s/g, '').replace(',', '.')` e depois `parseFloat`. Para `"1.250,00"` o resultado é `"1.250.00"` e `parseFloat` devolve `1.25` (R$ 1,25 em vez de R$ 1.250,00). Também devolve `0` silenciosamente para entrada inválida, o que esconde erro. O parser novo não pode reaproveitar essa função para a leitura de texto livre.

## Objetivo
Entregar `parseQuickAdd(text, context): Draft`, função pura e totalmente testada, que:
1. extrai valor, parcelas, data, conta (por apelido configurável), conta de destino (transferência), tipo (despesa, entrada, transferência, estorno), tags e descrição;
2. devolve um `Draft` tipado com `confidence` (0 a 1), lista `missing` de campos faltantes, `warnings` e os trechos (`spans`) de cada token reconhecido, para a UI renderizar chips editáveis;
3. cobre no mínimo 60 casos tabulados (seção Estratégia de testes);
4. NÃO chama LLM. O fallback por LLM quando a confiança é baixa fica para a FC2-F5-03; aqui o parser apenas sinaliza `needsFallback`.

## Fora de escopo
- Fallback por LLM e categorização por IA (FC2-F5-03).
- Resolução de categoria e merchant (FC2-F2-02). O Draft carrega `description` crua; `categoryId` fica nulo.
- Criar o lançamento no banco (FC2-F2-03) e UI da sheet (FC2-F2-04).
- Valores abreviados ("2k", "1,5 mil") e números por extenso ("quarenta reais").
- Moeda estrangeira (USD/IOF): fica para um ajuste posterior; o parser ignora `us$`/`usd` como texto de descrição e emite warning `FOREIGN_CURRENCY_UNSUPPORTED`.
- Recorrência por texto ("todo dia 5").

## Comportamento atual
- Não há parser de captura. `src/lib/format.ts` (1.x) tem `parseCents(reais: string)` que remove tudo exceto dígitos, vírgula, ponto e hífen e troca só a primeira vírgula por ponto: mesma falha de milhar. `src/lib/money.ts` tem `parseMoneyToCents` e `formatCentsToInput` (este último é reaproveitável).
- Datas no 1.x vêm de um campo de data; o schema Zod em `src/server/modules/finance/http/schemas.ts` converte `YYYY-MM-DD` para meio-dia UTC (`new Date(s + 'T12:00:00.000Z')`). O parser novo trabalha com strings `YYYY-MM-DD` e deixa a conversão para meio-dia UTC ao use-case da F2-03 (spec §9: "datas ao meio-dia UTC").

## Comportamento esperado

### Contrato (arquivo `src/server/modules/capture/domain/types.ts`)
```ts
export type DraftKind = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export type AccountRef = {
  id: string
  name: string
  aliases: string[]            // apelidos configuráveis, ex.: ['nu', 'nubank']
  type: 'CHECKING' | 'SAVINGS' | 'WALLET' | 'INVESTMENT' | 'CREDIT_CARD' | 'BUSINESS'
}

export type ParseContext = {
  today: string                // 'YYYY-MM-DD' no fuso America/Sao_Paulo, injetado (nunca Date.now() dentro do parser)
  accounts: AccountRef[]
  defaultAccountId?: string | null   // última conta usada; só entra se o texto não cita conta
  maxInstallments?: number           // default 48
}

export type FieldKey = 'amount' | 'description' | 'account' | 'toAccount'
export type TokenSpan = { field: FieldKey | 'installments' | 'date' | 'kind' | 'tag'; start: number; end: number; text: string }

export type WarningCode =
  | 'AMBIGUOUS_AMOUNT' | 'MULTIPLE_AMOUNTS' | 'ZERO_AMOUNT'
  | 'AMBIGUOUS_ACCOUNT' | 'SAME_ACCOUNT'
  | 'INVALID_DATE' | 'DATE_IN_FUTURE'
  | 'INSTALLMENTS_OUT_OF_RANGE' | 'FOREIGN_CURRENCY_UNSUPPORTED'

export type Draft = {
  rawText: string
  kind: DraftKind
  isRefund: boolean                       // "estorno"/"devolução": kind = INCOME + isRefund
  amountCents: number | null              // total da compra (nunca por parcela)
  installments: null | { count: number; mode: 'TOTAL' | 'PER_INSTALLMENT'; perInstallmentCents: number | null }
  description: string                     // texto livre restante, casing original preservado
  account: { id: string; source: 'TEXT' | 'DEFAULT' } | null
  toAccount: { id: string } | null        // só TRANSFER
  date: string                            // 'YYYY-MM-DD'
  dateSource: 'TEXT' | 'DEFAULT'
  tags: string[]                          // minúsculas, sem '#'
  confidence: number                      // 0..1, 2 casas
  missing: FieldKey[]
  warnings: { code: WarningCode; detail?: string; candidates?: string[] }[]
  needsFallback: boolean                  // true quando confidence < 0.6 ou faltar amount/description
  spans: TokenSpan[]
}
```
Função: `export function parseQuickAdd(text: string, ctx: ParseContext): Draft`.

### Valor
Aceita `42,90`, `42.90`, `1.250,00`, `2.400`, `2400`, `8`, `8,5`, `R$ 42,90`, `r$42,90`. Regras RN-01 a RN-04 abaixo. O parser ignora o símbolo `R$` e a palavra `reais`.

### Parcelas
`10x`, `10X`, `10 x`, `em 10x`, `10 vezes`, `em 10 vezes`: parcelamento TOTAL (o valor citado é o total). `10x de 240` ou `10x 240`: modo PER_INSTALLMENT, com `amountCents` = 10 × 240,00 e `perInstallmentCents` = 24000. `1x` equivale a à vista (`installments: null`). Limite 2 a 48.

### Datas
`hoje`, `ontem`, `anteontem`, `amanhã`/`amanha`, `dd/mm`, `dd/mm/aa`, `dd/mm/aaaa`, `dia N`, dia da semana (`segunda`, `terça`/`terca`, `quarta`, `quinta`, `sexta`, `sábado`/`sabado`, `domingo`, com ou sem `-feira`). Sem data no texto: `ctx.today` e `dateSource: 'DEFAULT'`.

### Contas
Apelidos configuráveis por conta (`AccountRef.aliases`) mais o nome da conta, comparados sem acento e sem diferenciar caixa. Vence o apelido mais longo (ex.: `nubank pj` vence `nubank`). Dois apelidos iguais em contas diferentes geram `AMBIGUOUS_ACCOUNT` com `candidates`, e `account` fica nulo.

### Transferência
Separadores `→`, `->`, `=>`, `pra`, `para`. Só vira TRANSFER quando há conta reconhecida depois do separador. Origem é a conta antes do separador. Gatilhos de palavra: `transf`, `transferi`, `transferência`, `pix` (este só quando as duas contas estão presentes).

### Entrada por palavras-chave
`salário`/`salario`, `recebi`, `receita`, `entrada`, `reembolso`, `rendimento`, `freela`, `recebido`, prefixo `+` no valor. `gastei`, `paguei`, `comprei` forçam EXPENSE e são removidos da descrição.

### Estorno
`estorno`, `estornado`, `devolução`/`devolucao`: `kind: 'INCOME'`, `isRefund: true`. A palavra de gatilho sai da descrição.

### Tags
`#tag` precedido de espaço ou início de texto; minúsculas; `[\p{L}\p{N}_-]+`.

### Confiança e faltantes
`confidence = 0.40*amount + 0.25*description + 0.25*account + 0.10*coerencia`, onde cada termo é 1 se presente e 0 se ausente (conta vinda de `DEFAULT` vale 0.5; TRANSFER usa as duas contas no termo `account`, 0.125 cada; `coerencia` é 1 se não houver warnings de ambiguidade), menos 0.15 por warning `AMBIGUOUS_*`/`MULTIPLE_AMOUNTS`, limitado a [0, 1]. `missing` lista `amount`, `description` (exceto TRANSFER), `account` (exceto quando há `DEFAULT`), `toAccount` (TRANSFER).

## Regras de negócio
- RN-01 (ponto e vírgula): se há vírgula, ela é o separador decimal e os pontos são milhar (`1.250,00` = 125000 centavos). Se há só ponto: com exatamente 3 dígitos depois do último ponto e grupos anteriores válidos, é milhar (`2.400` = 240000; `1.250.000` = 125000000); com 1 ou 2 dígitos depois do ponto é decimal (`42.90` = 4290; `1.5` = 150); qualquer outro formato (`1.2500`, `12,345`) é inválido e gera `AMBIGUOUS_AMOUNT` com `amountCents: null`.
- RN-02: valor zero ou negativo gera `ZERO_AMOUNT` e `amountCents: null`. O sinal de `-` não é aceito no início; o tipo vem das palavras-chave.
- RN-03: mais de um valor no texto usa o primeiro e gera `MULTIPLE_AMOUNTS`. `10x` e datas `dd/mm` nunca são lidos como valor.
- RN-04: todo valor é inteiro em centavos (ADR-002); conversão por `Math.round(Number(reais) * 100)` só após validar o formato (nunca `parseFloat` em string crua).
- RN-05 (data com ano omitido): `dd/mm` resolve para a ocorrência mais recente não posterior a `today + 31 dias`; se a data cair mais de 31 dias no futuro, usa o ano anterior. `dia N` resolve para o `N` mais recente menor ou igual a `today` (se o mês corrente não tem o dia N ou N > hoje, volta ao mês anterior que tenha o dia N; dia 31 em outubro com hoje 05/10 resolve para 31/08, pois setembro tem 30 dias).
- RN-06: dia da semana resolve para a ocorrência mais recente estritamente anterior a `today` (hoje, para dizer hoje, use `hoje`). Data inexistente (`31/02`) gera `INVALID_DATE` e cai no default.
- RN-07: data futura é aceita (gera `DATE_IN_FUTURE`); a F2-03 a trata como PLANNED.
- RN-08: apelido de conta só casa como palavra inteira (limites de palavra após normalizar acentos). `sextou` não é `sexta`; `nuvem` não é `nu`.
- RN-09: `pra`/`para` só é separador de transferência quando a próxima palavra reconhecida é uma conta. Em `mercado pra casa`, `pra` permanece na descrição.
- RN-10: transferência com origem igual ao destino gera `SAME_ACCOUNT` e `toAccount: null`.
- RN-11: descrição = texto restante depois de remover tokens reconhecidos, com espaços colapsados e casing original. Se vazia e houver palavra-gatilho de entrada, usa a palavra (`entrada 1000 itau` produz descrição `entrada`).
- RN-12: o parser nunca lança exceção. Entrada vazia devolve Draft com `confidence: 0`, `missing` completo e `needsFallback: true`.
- RN-13: o parser não conhece o estado do banco. Quem aplica `defaultAccountId` é o chamador via `ctx`.

## Critérios de aceitação
- [ ] CA-01: `parseQuickAdd` existe em `src/server/modules/capture/domain/parse-quick-add.ts`, exporta os tipos de `types.ts` e não importa Prisma, `next`, `react` nem `Date.now`/`new Date()` sem argumento.
- [ ] CA-02: a tabela de testes (seção abaixo) tem 60 ou mais linhas e todas passam via `npm test`.
- [ ] CA-03: `1.250,00` produz 125000, `2.400` produz 240000, `42.90` produz 4290 e `1.5` produz 150 (casos P-03, P-04, P-02, P-10).
- [ ] CA-04: `tv 2400 10x c6` e `tv 2400 em 10x c6` produzem `installments.count = 10`, `mode = 'TOTAL'`, `amountCents = 240000`.
- [ ] CA-05: `transf 500 pj → itau`, `transf 500 pj -> itau` e `transf 500 de pj pra itau` produzem TRANSFER com origem PJ e destino Itaú.
- [ ] CA-06: `estorno 89 amazon c6` produz `kind: 'INCOME'`, `isRefund: true`, `amountCents: 8900`.
- [ ] CA-07: o parser nunca lança exceção para entradas arbitrárias (teste de propriedade com 500 strings aleatórias geradas com semente fixa, incluindo unicode e strings de 5.000 caracteres).
- [ ] CA-08: tempo de execução menor que 1 ms por chamada em média (teste de performance com 1.000 chamadas, limite folgado de 200 ms no total em CI).
- [ ] CA-09: `confidence` e `missing` seguem a fórmula de RN e os casos P-96 a P-98 verificam os limiares (0.6 para `needsFallback`).
- [ ] CA-10: `npm run lint`, `npm test` e `npx next build` passam; nenhum valor real nos testes (só os fictícios da tabela).

## Impacto técnico
### Backend
Novo módulo `src/server/modules/capture/domain/` com:
- `types.ts` (contrato acima).
- `normalize.ts`: `normalizeText(s)` (NFD, remove diacríticos, minúsculas) mantendo mapeamento de índices para o texto original (necessário para `spans` e para preservar casing na descrição).
- `amount.ts`: `parseAmountToken(token): { cents: number } | { error: 'AMBIGUOUS' | 'ZERO' }` e `findAmountCandidates(text)`.
- `installments.ts`, `dates.ts` (`resolveDate(token, today)`), `accounts.ts` (`matchAccounts(text, accounts)`), `keywords.ts` (listas de gatilhos de entrada, estorno, transferência), `tags.ts`.
- `parse-quick-add.ts`: orquestra, na ordem: tags, parcelas, datas, valores, transferência/contas, palavras-chave, descrição, confiança.
- `parse-quick-add.test.ts` e `parse-quick-add.cases.ts` (tabela de casos exportada, reutilizável pela F5-03 para medir fallback).
- `index.ts` exportando `parseQuickAdd` e tipos.
### Frontend
Nenhum nesta task. A sheet (FC2-F2-04) importa `parseQuickAdd` diretamente no cliente; por isso o módulo não pode depender de código server-only.
### Banco de dados
Nenhum. Os apelidos vêm de `AccountRef.aliases`; o armazenamento do campo (`Account.aliases String[]`) pertence à FC2-F0-02/F1-02. Se o schema da F0-02 não tiver `aliases`, registrar a divergência em "Registro de execução" e abrir task para `dados-prisma`; o parser não muda.
### Integrações
Nenhuma. A F5-03 consumirá `needsFallback` e `missing`; F5-04 (bot) usará o mesmo parser.
### Segurança
Parser puro: nenhuma entrada de usuário vai para `eval`, regex dinâmica sem escape ou consulta. Todo apelido de conta é escapado antes de virar regex (`escapeRegExp`). Limitar o texto processado a 500 caracteres (excedente vira warning e é ignorado) para evitar regex custosa (ReDoS). Nenhum log do texto bruto.

## Plano de implementação
- [ ] Etapa 1: criar `src/server/modules/capture/domain/types.ts` com o contrato.
- [ ] Etapa 2: `normalize.ts` com normalização e mapa de índices; testes.
- [ ] Etapa 3: `amount.ts` (RN-01 a RN-04). Não reutilizar `src/lib/money.ts`; opcionalmente corrigir `parseMoneyToCents` em outra task (registrar como divergência).
- [ ] Etapa 4: `installments.ts` (`10x`, `em 10x`, `10 vezes`, `10x de 240`, limite 2 a 48).
- [ ] Etapa 5: `dates.ts` com RN-05 a RN-07; funções puras sobre strings `YYYY-MM-DD` (aritmética de calendário própria, sem `Date` local; usar `Date.UTC` ao meio-dia só internamente).
- [ ] Etapa 6: `accounts.ts` (apelido mais longo, ambiguidade, limites de palavra) e `keywords.ts`.
- [ ] Etapa 7: transferência (separadores, RN-09, RN-10) e tipo (entrada, estorno, `+`).
- [ ] Etapa 8: `tags.ts` e montagem da descrição (RN-11).
- [ ] Etapa 9: confiança, `missing`, `needsFallback`.
- [ ] Etapa 10: `parse-quick-add.cases.ts` com as 66 linhas abaixo; `parse-quick-add.test.ts` usa `it.each(cases)`.
- [ ] Etapa 11: testes de propriedade e performance; `index.ts`.
- [ ] Etapa 12: atualizar `docs/` (um parágrafo em `docs/domain/` sobre a sintaxe) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixture comum: `today = '2026-10-05'` (segunda-feira). Contas: Nubank (`nu`, `nubank`), Nubank PJ (`pj`, `nubank pj`), Itaú (`itau`, `itaú`), C6 cartão (`c6`), Mercado Pago (`mp`, `mercado pago`), Carteira (`dinheiro`, `carteira`). Sem `defaultAccountId`, salvo nos casos marcados. Notação: valores em centavos; `ac` = conta; `par` = parcelas.

- [ ] Unitários (tabela; todas as colunas são asserções sobre o Draft):

| # | Entrada | Esperado |
|---|---|---|
| P-01 | `ifood 42,90 nubank` | EXPENSE, 4290, desc `ifood`, ac Nubank, data 2026-10-05 DEFAULT, missing [] |
| P-02 | `ifood 42.90 nubank` | 4290 |
| P-03 | `mercado 1.250,00 itau` | 125000, ac Itaú |
| P-04 | `aluguel 2.400 itau` | 240000 |
| P-05 | `aluguel 2400 itau` | 240000 |
| P-06 | `café 8 nubank` | 800, desc `café` |
| P-07 | `café 8,5 nubank` | 850 |
| P-08 | `R$ 42,90 ifood nubank` | 4290, desc `ifood` |
| P-09 | `r$42,90 ifood` | 4290, ac null, missing [account] |
| P-10 | `padaria 1.5 nu` | 150 |
| P-11 | `viagem 1.250.000,50 itau` | 125000050 |
| P-12 | `uber 18` | 1800, ac null, missing [account], needsFallback false |
| P-13 | `uber 18` com `defaultAccountId` = Nubank | ac Nubank source DEFAULT, missing [] |
| P-14 | `uber` | amount null, missing [amount, account] |
| P-15 | `uber 0 nubank` | amount null, warning ZERO_AMOUNT |
| P-16 | `42,90` | amount 4290, missing [description, account] |
| P-17 | `ifood 12,345 nubank` | amount null, warning AMBIGUOUS_AMOUNT |
| P-18 | `ifood 1.2500 nubank` | amount null, warning AMBIGUOUS_AMOUNT |
| P-19 | `ifood 42,90 e 10,00 nubank` | 4290, warning MULTIPLE_AMOUNTS |
| P-20 | `42,90 ifood nubank` | 4290, desc `ifood` (valor no início) |
| P-21 | `tv 2400 10x c6` | 240000, par {10, TOTAL}, ac C6 |
| P-22 | `tv 2400 em 10x c6` | idem P-21 |
| P-23 | `tv 2400 10 vezes c6` | idem P-21 |
| P-24 | `tv 2400 10X C6` | idem P-21 (caixa) |
| P-25 | `tv 10x de 240 c6` | par {10, PER_INSTALLMENT, 24000}, amountCents 240000 |
| P-26 | `tv 2400 1x c6` | par null |
| P-27 | `tv 2400 12x` | par 12, ac null |
| P-28 | `tv 2400 49x c6` | par null, warning INSTALLMENTS_OUT_OF_RANGE |
| P-29 | `geladeira 3.600,00 em 12x itau` | 360000, par 12 |
| P-30 | `mouse 90 3 x c6` | 9000, par 3 |
| P-31 | `uber 18 hoje nubank` | data 2026-10-05, dateSource TEXT |
| P-32 | `uber 18 ontem` | 2026-10-04 |
| P-33 | `uber 18 anteontem` | 2026-10-03 |
| P-34 | `uber 18 03/10 nubank` | 2026-10-03 |
| P-35 | `uber 18 3/10` | 2026-10-03 |
| P-36 | `uber 18 15/09` | 2026-09-15 |
| P-37 | `uber 18 15/09/2026` | 2026-09-15 |
| P-38 | `uber 18 15/09/26` | 2026-09-15 |
| P-39 | `uber 18 20/12` | 2025-12-20 (mais de 31 dias no futuro volta um ano) |
| P-40 | `uber 18 31/02` | data 2026-10-05 DEFAULT, warning INVALID_DATE |
| P-41 | `uber 18 sexta` | 2026-10-02 |
| P-42 | `uber 18 segunda` | 2026-09-28 (estritamente anterior a hoje) |
| P-43 | `uber 18 terça-feira` | 2026-09-29 |
| P-44 | `uber 18 sabado` | 2026-10-03 |
| P-45 | `uber 18 dia 15` | 2026-09-15 |
| P-46 | `uber 18 dia 5` | 2026-10-05 |
| P-47 | `uber 18 dia 31` | 2026-08-31 |
| P-48 | `uber 18 amanhã` | 2026-10-06, warning DATE_IN_FUTURE |
| P-49 | `sextou 30 nubank` | desc `sextou`, data default (palavra inteira) |
| P-50 | `mercado 150 pj` | ac Nubank PJ |
| P-51 | `mercado 150 nubank pj` | ac Nubank PJ (apelido mais longo), desc `mercado` |
| P-52 | `mercado 150 nubank` | ac Nubank |
| P-53 | `mercado 150 Itaú` | ac Itaú (acento e caixa) |
| P-54 | `mercado 150 xpto` | ac null, desc `mercado xpto`, missing [account] |
| P-55 | `mercado pago 150` | ac Mercado Pago, desc vazia, missing [description] |
| P-56 | `nu 20 lanche` | ac Nubank, desc `lanche` (ordem livre) |
| P-57 | `nuvem 20 nubank` | ac Nubank, desc `nuvem` (`nu` não casa dentro de `nuvem`) |
| P-58 | duas contas com apelido `x` em comum: `padaria 10 x` | ac null, warning AMBIGUOUS_ACCOUNT com 2 candidates |
| P-59 | `almoço 35 dinheiro` | ac Carteira |
| P-60 | `transf 500 pj → itau` | TRANSFER 50000, de PJ, para Itaú, missing [] |
| P-61 | `transf 500 pj -> itau` | idem P-60 |
| P-62 | `transf 500 de pj pra itau` | idem P-60 |
| P-63 | `transf 500 pj para itau` | idem P-60 |
| P-64 | `transferi 1.000 nubank pra pj` | TRANSFER 100000, de Nubank, para PJ |
| P-65 | `transf 500 itau` | TRANSFER, missing [toAccount] |
| P-66 | `transf 500 pj → pj` | warning SAME_ACCOUNT, toAccount null, missing [toAccount] |
| P-67 | `pix 200 pj pra itau` | TRANSFER 20000 |
| P-68 | `pix 200 aluguel nubank` | EXPENSE, desc `pix aluguel`, ac Nubank |
| P-69 | `mercado pra casa 100 nubank` | EXPENSE, desc `mercado pra casa` |
| P-70 | `transf 500 pj → itau 05/10` | TRANSFER com data 2026-10-05 TEXT |
| P-71 | `salário 4000 pj` | INCOME 400000, ac PJ, desc `salário` |
| P-72 | `salario 4000 pj` | idem P-71 |
| P-73 | `recebi 300 freela nubank` | INCOME 30000, desc `freela` |
| P-74 | `reembolso 80 nubank` | INCOME 8000 |
| P-75 | `+500 freela nubank` | INCOME 50000 |
| P-76 | `rendimento 12,34 nubank` | INCOME 1234 |
| P-77 | `entrada 1000 itau` | INCOME 100000, desc `entrada` |
| P-78 | `pix recebido 100 nubank` | INCOME 10000, desc `pix` |
| P-79 | `gastei 50 mercado nubank` | EXPENSE 5000, desc `mercado` |
| P-80 | `paguei 120 luz itau` | EXPENSE 12000, desc `luz` |
| P-81 | `estorno 89 amazon` | INCOME, isRefund, 8900, desc `amazon`, ac null |
| P-82 | `estorno 89 amazon c6` | idem com ac C6 |
| P-83 | `devolucao 45 shopee c6` | INCOME, isRefund, 4500 |
| P-84 | `estorno` | amount null, missing [amount, description, account] |
| P-85 | `ifood 42,90 nubank #trabalho` | tags [`trabalho`] |
| P-86 | `ifood 42,90 #lazer #amigos nubank` | tags [`lazer`, `amigos`] |
| P-87 | `ifood #Viagem-2026 42,90` | tags [`viagem-2026`] |
| P-88 | `ifood 42,90 #` | tags [] |
| P-89 | `ifood#x 42` | tags [], desc `ifood#x` |
| P-90 | `` (vazio) | confidence 0, missing completo, needsFallback true |
| P-91 | `   ` | idem P-90 |
| P-92 | `  ifood   42,90   nubank  ` | idem P-01 (espaços colapsados) |
| P-93 | `IFOOD 42,90 NUBANK` | desc `IFOOD` (casing preservado), ac Nubank |
| P-94 | `açaí 15 nubank` | desc `açaí` |
| P-95 | `uber 18 nubank\n` | idem sem quebra de linha |
| P-96 | `ifood 42,90 nubank` | confidence 1.00, needsFallback false |
| P-97 | `uber 18` sem default | confidence 0.75 (0.40 + 0.25 + 0.10), needsFallback false |
| P-98 | `uber` | confidence menor que 0.6, needsFallback true |

  (A tabela excede 60 casos de propósito; os testes de limiar de confiança estão em P-96 a P-98. Os critérios CA-03/CA-09 referem-se a estes números.)
- [ ] Propriedade: 500 strings aleatórias com semente fixa (unicode, emojis, `#`, `→`, strings longas) nunca lançam exceção e sempre devolvem `confidence` entre 0 e 1 e `date` válida.
- [ ] Determinismo: duas chamadas de `parseQuickAdd` com o mesmo texto e o mesmo `ctx` devolvem Drafts iguais (`toEqual`).
- [ ] Integração: nenhuma nesta task.
- [ ] E2E: nenhum (a sheet da F2-04 cobre).
- [ ] Manual: colar as 10 linhas mais comuns do uso do dono (anonimizadas) e conferir chips na F2-04.

Edge cases adicionais que o implementador deve cobrir além da tabela: virada de ano (`today = 2026-01-03`, entrada `uber 18 28/12` resolve para 2025-12-28); ano bissexto (`29/02` com `today = 2028-03-10` resolve para 2028-02-29; com `today = 2026-10-05` gera `INVALID_DATE`); `dia 29` em março quando fevereiro tem 28 dias.

## Riscos e rollback
- Risco: ambiguidade `2.400` (milhar) versus `2.40` (decimal). Mitigação: RN-01 (3 dígitos após o ponto é milhar); a sheet sempre exibe o valor interpretado no chip para correção imediata.
- Risco: apelidos curtos (`nu`, `mp`) colidirem com palavras comuns. Mitigação: RN-08 (palavra inteira) e `AMBIGUOUS_ACCOUNT`.
- Risco: fuso. Mitigação: `today` injetado; testes fixam datas.
- Rollback: módulo novo e isolado; reverter o commit não afeta nada existente.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.
