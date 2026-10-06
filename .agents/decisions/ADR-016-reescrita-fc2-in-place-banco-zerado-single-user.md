---
id: ADR-016
title: Reescrita do FC 2.0 no mesmo repositório com banco zerado e uso single-user
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F0-01, FC2-F0-02, FC2-F0-06, FC2-F0-07]
supersedes: [ADR-007, ADR-014]
---

# ADR-016 — Reescrita do FC 2.0 no mesmo repositório com banco zerado e uso single-user

## Contexto
O FC 1.x tem backend sólido (centavos, ciclo de fatura testado, parcelas como ledger 1:1), mas o dono parou de usar: lançar custa 2 digitações e 5–9 cliques, o saldo ignora transferências, não há resposta para "quanto posso gastar" e não existe importação (spec §1). O banco Neon atual guarda apenas dados de teste e demo, e o dono autorizou em 2026-10-05 apagá-lo. O produto é de uso exclusivamente pessoal: não há clientes, demo pública nem landing de portfólio.

Forças em jogo:
- O histórico Git do 1.x tem valor (ADRs, testes, mensagens de commit) e o remoto público já tem estrelas/visibilidade de portfólio.
- O schema 1.x foi desenhado para multi-tenant SaaS com demo; o 2.0 precisa de `Transaction.status`, `seriesId`, `importHash`, `AccountBalance`, `Loan`, `IncomeRule` etc., o que altera quase todas as tabelas.
- Migrar dados de teste não tem valor; migrar dados reais do dono não existe (ele nunca os lançou de forma confiável).

## Decisão
1. **Reescrita in-place**: o FC 2.0 vive no mesmo repositório, na mesma branch `main`, sem repositório novo e sem pasta `v2/`. A F0 remove o legado e o código 1.x que não será reaproveitado.
2. **Banco zerado**: o schema Prisma 2.0 é escrito do zero (task FC2-F0-02). O histórico de migrations do 1.x é descartado; a migration inicial passa a ser `0001_init_fc2`. O reset do Neon (`prisma migrate reset --force` ou recriar a branch) é autorizado e executado apenas pelo papel `dados-prisma`, uma única vez, na F0, com registro no handoff.
3. **Single-user**: um usuário real. `userId` permanece em toda tabela financeira e em toda query (defesa em profundidade e caminho aberto para o modo casal da F7), mas: sem tela de cadastro pública (registro por seed/CLI), sem demo, sem planos, sem landing, sem RBAC.
4. **Reaproveitar só o que é bom** (spec §9), com testes migrando junto:

| Reaproveitar | Origem no 1.x | Destino no 2.0 |
|---|---|---|
| Dinheiro em centavos + parse pt-BR | `src/lib/money.ts` e `money.test.ts` | `src/lib/money.ts` (inalterado) |
| Ciclo de fatura | `src/server/modules/finance/application/credit-card/statement-cycle.ts` e teste | `src/server/modules/cards/domain/statement-cycle.ts` |
| Compras parceladas e antecipação | `.../credit-card-purchases/use-cases.ts` | `src/server/modules/cards/application/` adaptado ao schema novo |
| Transferência atômica | rota `api/transactions/transfer` | use-case `transferBetweenAccounts` em `ledger/application/` |
| Registry de marcas | `src/lib/brands/` e `public/brands/` | idem |
| Datas ao meio-dia UTC | `http/schemas.ts` | `src/lib/dates.ts` |
| Score e insights | `application/score`, `application/insights` | reavaliar na F6; não bloqueia |

5. **Descartar sem dó**: CRA legado em `src/` (`App.js`, `index.js`, `pages/`, `contexts/`), `backend/`, `database/`, coleções Postman, `start-api.*`, `README_*.md`, seed/reset demo (supersede **ADR-007**), dashboard drag-and-drop como home (ADR-017) e o módulo `wishlist` próprio (supersede **ADR-014**: a conversão desejo→compra vira o tipo `Goal.kind = WISH` com ação "converter em lançamento", ver `docs/product/especificacao-fc2.md` §4.4 e §6).

## Alternativas consideradas
### Alternativa A — Novo repositório `finance-controller-2`
- Vantagens: árvore limpa desde o primeiro commit; sem risco de reaproveitar lixo por inércia.
- Desvantagens: perde histórico, issues e links públicos do portfólio; obriga copiar manualmente `money.ts` e `statement-cycle.ts` com seus testes; duplica CI, secrets e projeto Vercel; o dono teria dois repositórios para manter sozinho.

### Alternativa B — Migração incremental sobre o schema 1.x
- Vantagens: nenhum reset de banco; entregas visíveis a cada PR.
- Desvantagens: `Transaction` precisaria ganhar 10+ colunas e enums com backfill de dados que são só de teste; o modelo "receita − despesa do mês" do `monthly-summary.ts` conflita com o ledger (ADR-019), então haveria dois modelos de saldo coexistindo; o custo de manter compatibilidade supera o de escrever o schema do zero.

### Alternativa C — Reescrita in-place com banco zerado (escolhida)
- Vantagens: preserva histórico e testes valiosos; schema coerente desde o início; F0 pequena (7 tasks).
- Desvantagens: janela em que `main` não roda o produto completo; exige disciplina para não reintroduzir legado.

## Consequências
### Positivas
- Schema único, sem colunas mortas; migration inicial legível.
- Superfície de código menor (remoção de CRA, `backend/`, `database/`).
- Testes de `money` e `statement-cycle` continuam como rede de segurança.

### Negativas
- `main` fica sem produto utilizável entre F0 e F1; o dono continua sem usar o app até o saldo confiável (F1).
- Perde-se o demo público usado como vitrine.

### Riscos
- Reset acidental do banco errado: mitigação com `DATABASE_URL` conferida, branch Neon de backup (`create_branch`) antes do reset e veto do `dados-prisma`.
- Reaproveitamento de código 1.x com premissas multi-tenant: mitigação em revisão do `qa-revisor`.

## Plano de adoção
1. FC2-F0-01: remover legado, ajustar `eslint`, `tsconfig` e `package.json` (scripts e dependências órfãs).
2. FC2-F0-02: schema 2.0, branch de backup no Neon, reset e migration `0001_init_fc2`; `prisma/seed.ts` cria apenas o usuário único e categorias padrão (F1-07), sem dados fictícios.
3. FC2-F0-06: auth single-user (F0). FC2-F0-07: testes e CI com fixtures sintéticas.
4. Migrar `money.ts` e `statement-cycle.ts` com testes verdes antes de qualquer feature nova.

## Validação
- `grep -R "backend/\|database/\|src/pages" -l` retorna vazio após F0-01.
- `npx prisma migrate status` limpo e `npm test` verde no CI.
- Nenhum arquivo de demo/seed com dados fictícios de usuário em `prisma/`.

## Revisão
Reavaliar ao fechar a F1 (saldo de cada conta = saldo do banco) ou se surgir necessidade real de segundo usuário (F7-02, modo casal).
