# Task: Phase 8.5 - Demo and Portfolio Hardening

## Status

- [ ] Todo
- [x] In Progress
- [ ] Done

## Context

As Phases 8.1 a 8.4 consolidaram analytics core, base de testes, billing de cartao e estrategia inicial de snapshot/invalidation. Antes de iniciar features novas de produto, o projeto precisa passar por uma etapa de endurecimento da demo e refinamento da narrativa de portfolio.

Esta fase deriva da [Phase 8 - Foundation for Analytics and Credit Card Billing](./phase-8-analytics-foundation-and-credit-card-billing.md) e prepara terreno para Goal Engine, Forecast, Score e Insights.

## Objective

Deixar o produto mais consistente para demonstracao, portfolio e evolucao tecnica, garantindo que a base construida nas fases anteriores esteja visivel, confiavel e facil de defender.

## Scope

- Revisar seed e reset demo para garantir cenarios financeiros mais completos
- Exibir pelo menos uma fatura aberta e uma paga na demo
- Validar os fluxos principais com o dominio atual:
  - dashboard
  - transacoes
  - recorrencias
  - contas
  - cartoes e faturas
- Ajustar UI e textos onde houver friccao na demonstracao
- Atualizar documentacao narrativa do projeto apenas com o que ja estiver implementado

## Out of Scope

- Implementar Goal Engine
- Implementar Forecast Engine
- Implementar Score Financeiro
- Implementar feed de insights
- Reescrever o design system

## Decisions

- Esta fase nao deve introduzir novos modulos de dominio grandes
- Qualquer ajuste estrutural deve ser pequeno, focado em consistencia e demo quality
- README e changelog so devem refletir funcionalidades de fato entregues

## Contracts

### Functional contracts

- O reset demo deve reconstruir um estado demonstravel sem passos manuais
- A conta `CREDIT_CARD` de demo deve ter:
  - configuracao valida de billing
  - fatura aberta
  - pelo menos uma fatura quitada ou parcialmente paga
- Os fluxos principais nao devem depender de dados ausentes para demonstracao

### Documentation contracts

- A documentacao de roadmap deve apontar para tasks reais em `.docs/tasks/`
- A documentacao publica nao deve prometer features ainda nao implementadas como se ja existissem

## Migrations

- Nao deve exigir migration obrigatoria
- Pode exigir apenas ajuste de seed/reset demo, se necessario

## UI

- Revisar estados da pagina `/credit-cards`
- Revisar detalhe de fatura em `/credit-cards/[id]`
- Revisar textos e empty states do dashboard para demo
- Revisar navegacao e descoberta das features entregues

## Tests

- Rodar `npm test`
- Rodar `npm run lint`
- Rodar `npm run build`
- Validar manualmente:
  - reset demo
  - leitura de dashboard
  - leitura e pagamento de fatura
  - criacao e listagem de transacoes

## Checklist

- [x] Seed/reset demo fortalecidos
- [x] Fluxos principais revisados
- [x] Estados de UI ajustados para demonstracao
- [x] Documentacao publica alinhada ao estado real
- [x] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Priorize demonstrabilidade e consistencia. Esta fase existe para reduzir atrito antes de entrar nas features de alto impacto. Se surgir uma melhoria tecnica grande, documente e empurre para uma phase propria em vez de inflar esta task.

Status atual:

- Reset demo e seed passaram a gerar um cenario mais forte de cartao, com pelo menos uma fatura quitada e outra em aberto
- A listagem de faturas foi ajustada para destacar melhor proximo vencimento, valor comprometido e ultima fatura paga
- O detalhe da fatura agora trata corretamente faturas quitadas e ausencia de conta de origem
- A listagem de transacoes passou a exibir link para a fatura vinculada quando a compra pertence a um cartao
- README e contexto vivo foram alinhados ao estado real do produto
- Ainda falta validar manualmente o fluxo completo em runtime; `npm test` e `eslint` dos arquivos alterados passaram, mas o `next build` ficou bloqueado por um processo antigo preso no ambiente
