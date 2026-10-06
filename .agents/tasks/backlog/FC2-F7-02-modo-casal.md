---
id: FC2-F7-02
title: Modo casal (household + permissões por conta)
status: backlog
type: feature
phase: F7
wave: null
owner: api-servidor
depends_on: [FC2-F1-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [auth, accounts, ledger, budget, tools, telegram]
related_use_cases: []
related_adrs: [ADR-016, ADR-019, ADR-025, ADR-027]
---

# FC2-F7-02 — Modo casal (household + permissões por conta)

> Backlog sem data. Contraria a decisão atual de uso single-user (ADR-016); só executar com ADR novo aprovado pelo dono. Alto impacto: toca o escopo de acesso de praticamente todas as consultas.

## Contexto
O FC 2.0 é pessoal (um usuário), mas mantém `userId` em todas as tabelas por segurança. Um possível uso futuro é compartilhar parte das finanças com a parceira: contas conjuntas visíveis aos dois, contas privadas de cada um, e um "livre" da casa além do individual.

## Problema
Com `userId` como único critério de acesso, duas pessoas só poderiam compartilhar copiando dados. Não há conceito de grupo (household), papel, nem permissão por conta.

## Objetivo
Introduzir **household** com membros e **permissões por conta** (nenhuma, ver, editar), de modo que cada usuário veja suas contas privadas e as compartilhadas, com visões individual e da casa, sem vazar contas privadas.

## Fora de escopo
- Mais de 2 membros, convites por e-mail em massa, cobrança/divisão de despesas entre membros (rachar contas), perfis infantis.
- Bot Telegram multiusuário completo (só preparar o vínculo por usuário).
- Open Finance (F7-01).

## Comportamento atual
Single-user: sessão identifica um `userId`; todos os repositórios filtram por `userId`; `TelegramLink` vincula um chat a um usuário; `McpToken` e `AiSettings` por usuário. Não existe household.

## Comportamento esperado
1. **Household**: um usuário cria uma casa e convida outro por **link de convite** de uso único (token com hash, expira em 48 h). O convidado, já autenticado, aceita.
2. **Permissões por conta**: para cada conta, cada membro tem `NONE | VIEW | EDIT`. O dono da conta é sempre `EDIT` e é o único que altera as permissões. Contas novas nascem **privadas** (`NONE` para os outros).
3. **Escopo de acesso central**: função `getAccessScope(userId)` devolve `{ viewableAccountIds, editableAccountIds, householdId? }`; todas as consultas e use-cases passam a filtrar por conta (via `AccessScope`) em vez de só por `userId`.
4. **Visões**: seletor "Eu | Casa" nas telas Hoje, Lançamentos e Planejar; "Casa" agrega contas compartilhadas (e, para cada pessoa, só o que ela vê); engine Disponível calcula por escopo.
5. **Categorias, merchants e regras** continuam por usuário; categorias compartilhadas ficam fora do escopo desta task (usar nomes iguais).
6. **Auditoria simples**: `Transaction.createdByUserId` e `updatedByUserId` mostrados em contas compartilhadas.
7. **Saída**: um membro pode sair da casa; contas compartilhadas dele voltam a privadas e deixam de aparecer para o outro, mantendo o histórico de cada lado conforme a permissão que existia (decisão registrada no ADR).

## Regras de negócio
- RN-01: Contas privadas **nunca** aparecem para outro membro (nem em agregados da "Casa", nem em tools, bot, MCP ou agentes).
- RN-02: Somente o dono da conta altera permissões e arquiva a conta; `EDIT` permite lançar/editar transações, não apagar a conta.
- RN-03: Toda consulta usa `AccessScope`; consulta sem escopo deve ser impossível por construção (repositório base exige o escopo como parâmetro); teste de arquitetura procura `where: { userId }` isolado em módulos financeiros.
- RN-04: Tools (F5-01), bot (F5-04), MCP (F5-06) e agentes (F5-05) recebem o `AccessScope` do usuário autenticado; um token MCP herda o escopo do seu dono.
- RN-05: Ledger e saldos (ADR-019) permanecem por conta; agregados "Casa" somam apenas contas visíveis ao usuário que consulta.
- RN-06: Convite: token aleatório de uso único, guardado com hash, expira em 48 h, aceito só por usuário autenticado diferente do criador; máximo 2 membros por household.
- RN-07: Transferência entre contas de usuários diferentes exige `EDIT` nas duas contas.
- RN-08: Dados privados do outro (descrições, saldos) nunca em log, notificação ou mensagem de bot de outro membro.
- RN-09: Migração: dados atuais viram `Household` implícito de 1 membro, sem mudar comportamento visível.
- RN-10: Reversível: desfazer household devolve todas as contas a `NONE` para terceiros.

## Critérios de aceitação
- [ ] CA-01: ADR novo (numeração seguinte à 031) aprovado, descrevendo mudança de escopo de acesso e política de saída do household.
- [ ] CA-02: Dois usuários sintéticos A e B: conta privada de A invisível para B em todas as superfícies (API, tools, bot, MCP).
- [ ] CA-03: Conta compartilhada com `VIEW` aparece para B sem permitir editar; com `EDIT` permite lançar.
- [ ] CA-04: "Casa" soma apenas contas visíveis ao solicitante; trocar entre "Eu" e "Casa" altera o "livre" de forma coerente.
- [ ] CA-05: Convite de uso único expira e não pode ser reaproveitado; terceiro usuário não aceita convite de household cheio.
- [ ] CA-06: Teste de arquitetura falha se um repositório financeiro consultar sem `AccessScope`.
- [ ] CA-07: Sair do household remove acesso cruzado imediatamente.
- [ ] CA-08: Migração dos dados existentes não altera nenhum número exibido para o usuário atual.
- [ ] CA-09: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/auth/` ganha `access-scope.ts`; novo módulo `households` (`domain`: permissões e regras, `application`: criar, convidar, aceitar, sair, definir permissão; `infra`; `http`); todos os repositórios dos módulos `ledger`, `accounts`, `cards`, `recurring`, `budget`, `debts`, `imports`, `tools` passam a receber `AccessScope`. Rotas: `api/household`, `api/household/invites`, `api/accounts/[id]/permissions`.
### Frontend
Seletor "Eu | Casa", tela de convite/aceite, gestão de permissões por conta em Mais > Contas (tokens `--fc-*`).
### Banco de dados
`Household`, `HouseholdMember { role }`, `AccountPermission { accountId, memberUserId, level }`, `HouseholdInvite { tokenHash, expiresAt, usedAt }`, `Transaction.createdByUserId/updatedByUserId`; migration de dados (household implícito).
### Integrações
Nenhuma nova.
### Segurança
Isolamento entre usuários é o ponto crítico: escopo obrigatório por construção, testes de vazamento, convite com hash e expiração.

## Plano de implementação
- [ ] 1. Escrever e aprovar o ADR (CA-01); mapear todos os repositórios que filtram por `userId`.
- [ ] 2. Modelar `Household`/permissões e migration com backfill.
- [ ] 3. `AccessScope` e repositório base que o exige; migrar módulo por módulo.
- [ ] 4. Convites e permissões (use-cases + rotas).
- [ ] 5. Propagar escopo a tools, bot, MCP e agentes.
- [ ] 6. Seletor "Eu | Casa" e engine Disponível por escopo.
- [ ] 7. Testes de vazamento e arquitetura; docs em `docs/architecture/households.md`; `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: matriz de permissões (NONE/VIEW/EDIT × leitura/escrita); expiração e uso único do convite; cálculo de `AccessScope`.
- [ ] Integração: dois usuários sintéticos com contas privadas e compartilhadas, todas as rotas e tools; saída do household; transferência entre contas com permissões diferentes.
- [ ] E2E: n/a até a execução.
- [ ] Manual: duas sessões (navegador normal e anônimo) verificando isolamento.

## Riscos e rollback
- **Vazamento de dados privados** por consulta sem escopo (risco principal): escopo obrigatório e teste de arquitetura.
- **Refatoração ampla**: migrar por módulo, com testes verdes a cada passo.
- **Quebra da premissa single-user**: exige ADR e decisão explícita do dono.
- Rollback: manter household implícito de 1 membro e desativar convites; migration só adiciona tabelas/colunas.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
