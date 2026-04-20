# Task: Phase 30 - Form Hardening And Status Feedback

## Status

- [ ] Todo
- [ ] In Progress
- [ ] Done

## Context

O backend ja protege os principais fluxos financeiros com Zod, incluindo `amount` positivo em transacoes, transferencias, recorrencias e pagamentos.

Mesmo assim, o frontend ainda expoe alguns pontos de atrito:

- os filtros de transacoes usam superficies transparentes e perdem contraste em telas muito claras;
- campos `type="number"` ainda aceitam interacoes nativas pouco amigaveis, como spinner e mudanca acidental por scroll do mouse;
- o feedback de status em recorrencias existe, mas hoje depende quase so de `opacity` e badge neutra, o que enfraquece a leitura do estado pausado.

Referencias principais:

- `src/app/(app)/transactions/transaction-filters.tsx`
- `src/app/(app)/transactions/transaction-form.tsx`
- `src/app/(app)/recurring/recurring-form.tsx`
- `src/app/(app)/recurring/recurring-list.tsx`
- `src/app/(app)/goals/goal-form.tsx`
- `src/app/(app)/credit-cards/[id]/statement-payment-form.tsx`
- `src/app/(app)/accounts/account-form.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/server/modules/finance/http/schemas.ts`

## Objective

Reduzir erros acidentais de preenchimento, melhorar contraste de filtros e deixar estados operacionais mais obvios para o usuario.

## Scope

- Dar contraste explicito para os filtros da pagina de transacoes sem quebrar o tema atual.
- Endurecer a UX de campos monetarios para evitar valores negativos, spinner desnecessario e alteracao por wheel.
- Avaliar a extracao de um padrao compartilhado para `MoneyInput` ou um conjunto de props/utilitarios reutilizaveis.
- Aplicar feedback visual mais forte para recorrencias pausadas, usando badge, borda, fundo ou combinacao equivalente.
- Revisar erros client-side para refletir melhor as regras que ja existem no backend.

## Out of Scope

- Reescrever todos os formularios do app.
- Introduzir uma biblioteca externa pesada de mascara monetaria sem necessidade.
- Alterar contratos de API apenas para resolver problemas cosmeticos.
- Redesenhar completamente a pagina de recorrencias.

## Decisions

- A regra de negocio continua sendo: valores monetarios devem ser positivos e persistidos em centavos.
- O objetivo desta fase nao e mudar a validacao server-side, e sim aproximar a UX do comportamento ja esperado pelo backend.
- Sempre que possivel, padroes de input devem ser reutilizados entre transacoes, recorrencias, metas, pagamentos e contas.

## Contracts

Contratos externos a preservar:

- `POST /api/transactions`
- `POST /api/transactions/transfer`
- `POST /api/recurring-rules`
- `POST /api/goals`
- `POST /api/credit-cards/statements/[id]/payments`

Mudancas esperadas ficam no frontend e em helpers internos de parse/normalizacao.

## Migrations

- Nenhuma migration de banco e necessaria.

## UI

Superficies afetadas:

- barra de filtros de `/transactions`;
- dialog de nova transacao;
- dialog de recorrencia;
- form de metas;
- form de pagamento de fatura;
- campos numericos de contas, quando aplicavel;
- status visuais de `/recurring`.

Pontos de atencao:

- filtros precisam destacar-se do background sem parecer blocos pesados;
- campos monetarios devem continuar faceis de usar em desktop e mobile;
- recorrencias pausadas devem ser percebidas a primeira vista, mesmo em listas longas.

## Tests

- Unitarios
  - helper de parse/normalizacao monetaria, se extraido.
- Componentes
  - garantir props/padrao dos inputs monetarios compartilhados.
- Manual
  - validar digitacao, wheel, spinner e submit nos principais formularios;
  - validar leitura rapida de recorrencias ativas vs pausadas.

## Checklist

- [ ] Filtros de transacoes com contraste melhorado
- [ ] Padrao de input monetario endurecido nos fluxos principais
- [ ] Recorrencias com status visual mais forte
- [ ] Testes passando
- [ ] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Tratar esta fase como hardening transversal:

1. definir o padrao de input monetario primeiro;
2. reaplicar esse padrao nos formularios mais criticos;
3. fechar com contraste dos filtros e status de recorrencias.
