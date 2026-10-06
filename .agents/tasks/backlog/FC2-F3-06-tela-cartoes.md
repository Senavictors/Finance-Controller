---
id: FC2-F3-06
title: Tela Cartões (carrossel, fatura, pagar, parcelas, mover, estorno)
status: backlog
type: feature
phase: F3
wave: 1
owner: telas-produto
depends_on: [FC2-F1-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [app-cartoes, cards, components-fc]
related_use_cases: []
related_adrs: [ADR-008, ADR-017, ADR-018, ADR-019]
---

# FC2-F3-06 — Tela Cartões (carrossel, fatura, pagar, parcelas, mover, estorno)

## Contexto
A aba Cartões (spec §4.5) concentra tudo de crédito: carrossel de cartões, fatura atual, pagar fatura com a conta de maior saldo, próximas faturas com a parte de parcelas, parcelas ativas, mover lançamento entre faturas e estorno abatendo a fatura. O domínio (ciclo de fatura, compras, parcelas, pagamento, mover, estorno) é entregue pela FC2-F1-03; esta task é a tela.

## Problema
No 1.x existem `src/app/(app)/credit-cards/page.tsx`, `credit-cards/[id]/page.tsx`, `statement-payment-form.tsx` e `statement-transactions-list.tsx`: layout desktop com formulário de pagamento em linha, sem carrossel, sem parcelas ativas agregadas, sem aviso de uso do cheque especial ao pagar e sem mover lançamento entre faturas. Usam cores do tema antigo.

## Objetivo
Entregar `src/app/(app)/cartoes/page.tsx` mobile-first:
1. carrossel horizontal de cartões (gradiente por emissor, nome, final fictício no exemplo, limite usado e disponível);
2. fatura atual do cartão selecionado: aberta ou fechada, total, vence em N dias, lista de lançamentos por data;
3. ação "Pagar fatura": sheet que sugere a conta de maior saldo e avisa se vai usar cheque especial;
4. "Próximas faturas" com o total e a parte de parcelas de cada mês;
5. "Parcelas ativas": compras parceladas com `n/N`, valor da parcela e término;
6. mover um lançamento para outra fatura;
7. estorno abatendo a fatura.

## Fora de escopo
- Regra de ciclo, parcelas, pagamento e estorno (domínio na FC2-F1-03; aqui só consumo).
- Antecipação de parcelas (se a F1-03 não expor, fica para backlog).
- Cadastro/edição de cartão (conta em "Mais"/F1-02).
- Gráficos (F6-03).

## Comportamento atual
- `src/app/(app)/credit-cards/page.tsx` e `[id]/page.tsx` (1.x): lista de cartões e detalhe por fatura.
- `src/app/(app)/credit-cards/[id]/statement-payment-form.tsx` e `statement-transactions-list.tsx` (1.x): pagamento e lançamentos da fatura; referência de campos úteis.
- `src/lib/brands/credit-card-theme.ts` (+ teste) e `src/lib/brands/registry.ts` (1.x): tema/gradiente por emissor e registry de marcas; reaproveitar a lógica de mapeamento por `issuerKey`, trocando as cores por tokens `--fc-*` ou por gradientes definidos como tokens novos (propor em `tokens.css` via FC2-F0-03 se necessário, nunca cor literal no componente).
- `public/brands/` (1.x): ícones de bancos e serviços.
- `src/server/modules/finance/application/credit-card/billing.ts` e `statement-cycle.ts` (1.x): lógica agora portada para `cards/` na F1-03.

## Comportamento esperado

### Layout (390x844)
```text
Cartões
[ carrossel: cartão A | cartão B | cartão C ]   (snap, 1 cartão em foco)
Fatura de 05/11 · aberta · vence em 31 dias        R$ 1.240,00
 Limite usado 62%  ▓▓▓▓▓▓░░░░                    disponível R$ 760,00
[ Pagar fatura ]  [ Ver fechamento ]
Lançamentos
  03/10  Mercado            R$ 120,00
  04/10  TV (3/10)          R$ 240,00     ⋯ (mover / estornar)
Próximas faturas
  05/12   R$ 980,00   (parcelas R$ 700,00)
  05/01   R$ 700,00   (parcelas R$ 700,00)
Parcelas ativas
  TV 3/10 · R$ 240,00/mês · termina 05/07
```
Tokens: cartão com gradiente por emissor (tokens), `--fc-glass` e `--fc-rim` nos cards, `--fc-radius-lg`, números em `--fc-font-num` com tabular-nums, atrasado/vencido em `--fc-pend`, dívida/parcelas em `--fc-debt`.

### Pagar fatura (sheet)
Lista contas de caixa ordenadas por saldo decrescente; pré-seleciona a de maior saldo. Se o saldo da conta escolhida menos o valor ficar negativo, mostra o aviso "vai usar R$ X do cheque especial" (`--fc-pend`) com o custo estimado de juros (campo vindo da F1-05) e, se superar o limite, bloqueia com a mensagem "excede o limite". Valor padrão: total da fatura; permite pagamento parcial. Confirmação chama o use-case de pagamento da F1-03 (cria o par de lançamentos `CARD_PAYMENT`, ADR-004).

### Mover lançamento
Menu do lançamento: "Mover para outra fatura" abre seletor com as faturas abertas/futuras do cartão; chama o use-case da F1-03; recalcula totais. Não permite mover para fatura paga.

### Estorno
Menu "Estornar" cria lançamento INCOME ligado à fatura (use-case F1-03), abate o total e mostra a linha com `--fc-in`.

## Regras de negócio
- RN-01: valores em centavos e formatados em reais (`formatCurrency` de `src/lib/format.ts`); datas de fatura exibidas em UTC.
- RN-02: a chave da fatura é o mês de vencimento (ADR-008); o rótulo mostra o vencimento ("Fatura de 05/11").
- RN-03: "aberta" = antes do fechamento, "fechada" = após o fechamento e antes do pagamento total; "paga" quando saldo a pagar zerar.
- RN-04: pagar com saldo insuficiente é permitido até o limite do cheque especial, sempre com aviso; acima do limite é bloqueado.
- RN-05: parcelas de compras aparecem em cada fatura futura; "Próximas faturas" separa o total das parcelas.
- RN-06: estorno nunca altera saldo de conta corrente; abate a fatura.
- RN-07: toda leitura filtra por `userId`.
- RN-08: só tokens `--fc-*`; nenhuma cor literal; alvos de toque de no mínimo 44 px.
- RN-09: exemplos e dados de teste fictícios (nenhum final de cartão real).

## Critérios de aceitação
- [ ] CA-01: `/cartoes` renderiza em 390x844 sem rolagem horizontal da página, com TabBar fixa e aba "Cartões" ativa.
- [ ] CA-02: carrossel com snap, um cartão em foco; trocar o cartão atualiza fatura, próximas faturas e parcelas.
- [ ] CA-03: fatura mostra status (aberta, fechada, paga), vence em N dias, total e limite usado/disponível corretos para dados sintéticos.
- [ ] CA-04: "Pagar fatura" pré-seleciona a conta de maior saldo e avisa uso do cheque especial; acima do limite bloqueia.
- [ ] CA-05: "Próximas faturas" exibe total e parte de parcelas por mês.
- [ ] CA-06: "Parcelas ativas" exibe `n/N`, valor da parcela e mês de término.
- [ ] CA-07: mover lançamento para outra fatura atualiza os dois totais; mover para fatura paga é recusado.
- [ ] CA-08: estorno reduz o total da fatura e não altera saldo de conta corrente.
- [ ] CA-09: nenhuma cor literal; contraste dos textos sobre os gradientes de cartão com razão mínima 4,5:1 (texto normal) verificada.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Consome use-cases da F1-03 (`listCards`, `getStatement`, `listUpcomingStatements`, `listActiveInstallments`, `payStatement`, `moveCardEntry`, `refundCardEntry`). Se a F1-03 não expôs a listagem agregada de próximas faturas/parcelas ativas, criar `src/server/modules/cards/application/list-upcoming-statements.ts` e `list-active-installments.ts` e rotas finas `src/app/api/cards/**` (registrar divergência). Reaproveitar do 1.x a ideia de `statement-payment-form.tsx`, não o código.
### Frontend
`src/app/(app)/cartoes/page.tsx` (server component), `cartoes-client.tsx`, `src/components/fc/cartoes/`: `card-carousel.tsx`, `credit-card-visual.tsx` (usa o mapeamento de `src/lib/brands/credit-card-theme.ts`), `statement-summary.tsx`, `statement-entries.tsx`, `pay-statement-sheet.tsx`, `move-entry-sheet.tsx`, `upcoming-statements.tsx`, `active-installments.tsx`. Remover `src/app/(app)/credit-cards/` do 1.x se a F0-01 não removeu.
### Banco de dados
Nenhum novo.
### Integrações
Nenhuma.
### Segurança
Rotas com `requireAuth` e `userId`; Zod nos corpos.

## Plano de implementação
- [ ] Etapa 1: confirmar com a F1-03 os use-cases e DTOs disponíveis; criar os que faltarem.
- [ ] Etapa 2: `credit-card-visual` e `card-carousel` (CSS scroll-snap, sem biblioteca; animar apenas `transform`/`opacity`).
- [ ] Etapa 3: `statement-summary` e `statement-entries`.
- [ ] Etapa 4: `pay-statement-sheet` com aviso de cheque especial.
- [ ] Etapa 5: `upcoming-statements` e `active-installments`.
- [ ] Etapa 6: mover lançamento e estorno.
- [ ] Etapa 7: estados vazio/erro/carregando; remover tela antiga; docs (`docs/ui/`) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: formatação do rótulo da fatura e "vence em N dias" (hoje 2026-10-05, vencimento 2026-11-05 = 31 dias; vencimento hoje = "vence hoje"; vencido = "venceu há N dias" em `--fc-pend`); percentual de limite usado (limite R$ 2.000,00 e fatura R$ 1.240,00 = 62%); ordenação das contas por saldo; aviso de cheque especial (saldo R$ 300,00, pagar R$ 500,00: "vai usar R$ 200,00 do cheque especial"; acima do limite bloqueia).
- [ ] Integração: com `fetch` simulado, pagar chama o use-case com conta e valor corretos; mover para fatura paga retorna erro e a UI mostra a mensagem; estorno atualiza o total.
- [ ] E2E: opcional, se houver Playwright (selecionar cartão, pagar, ver status).
- [ ] Manual (iPhone 13 Pro): swipe do carrossel, gradientes, legibilidade, sheet de pagamento.

Edge cases: usuário sem cartão (estado vazio com atalho para criar conta tipo cartão); cartão sem fechamento/vencimento configurados (mensagem para configurar); fatura com valor zero; fatura com crédito de estorno maior que o total; muitas parcelas ativas (lista rolável); cartão arquivado oculto.

## Riscos e rollback
- Risco: legibilidade de texto sobre gradientes. Mitigação: auditoria de contraste (CA-09) e overlay `--fc-scrim` leve atrás do texto.
- Risco: dependência da F1-03 incompleta. Mitigação: etapa 1 verifica o contrato e registra lacunas em Divergências.
- Rollback: rota nova isolada; reverter o commit não afeta dados.

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
