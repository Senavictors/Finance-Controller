# Task: Phase 32 - Settings, Profile And Confirmation UX

## Status

- [ ] Todo
- [ ] In Progress
- [ ] Done

## Context

O feedback final tocou em uma lacuna de produto mais ampla: hoje a area de `Configuracoes` ainda e muito estreita e focada quase exclusivamente em reset de dados demo.

Ao mesmo tempo, varios fluxos destrutivos do app ainda dependem de `confirm()` e `alert()`, o que quebra consistencia visual e passa uma sensacao de produto inacabado.

No estado atual do projeto:

- existe auth custom com `User`, `Session`, bcrypt e cookies;
- a pagina `src/app/(app)/settings/page.tsx` nao oferece edicao de perfil;
- ha multiplos usos de `confirm()` e `alert()` em contas, categorias, transacoes, recorrencias, metas e reset demo;
- o schema Prisma ja permite exclusao em cascata a partir de `User`, o que abre caminho para uma estrategia de remocao de conta e dados.

Referencias principais:

- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/accounts/account-card.tsx`
- `src/app/(app)/categories/category-list.tsx`
- `src/app/(app)/transactions/transaction-table.tsx`
- `src/app/(app)/recurring/recurring-list.tsx`
- `src/app/(app)/goals/goal-card.tsx`
- `src/server/auth/*`
- `prisma/schema.prisma`
- `src/components/ui/dialog.tsx`

## Objective

Transformar `Configuracoes` em uma area real de gestao de conta e substituir confirmacoes nativas do navegador por uma UX consistente com o restante da aplicacao.

## Scope

- Expandir `/settings` com uma secao de perfil do usuario.
- Permitir edicao dos dados pessoais essenciais, como nome e email.
- Avaliar e implementar troca de senha dentro do fluxo autenticado, se o contrato atual suportar bem isso.
- Projetar um fluxo seguro para exclusao da propria conta e dos dados associados.
- Criar um padrao compartilhado de modal de confirmacao para acoes destrutivas.
- Migrar os `confirm()` e `alert()` principais para esse padrao compartilhado.

## Out of Scope

- Avatar, upload de foto ou perfil publico.
- Preferencias de notificacao.
- Multiusuario, workspaces ou compartilhamento.
- Exportacao completa de dados nesta mesma fase, salvo se virar subtask separada.

## Decisions

- A exclusao da conta deve ser uma acao explicitamente destrutiva, com copy clara e confirmacao reforcada.
- Sempre que possivel, o novo fluxo de confirmacao deve reutilizar a base de `Dialog` ja presente no projeto.
- A estrategia de perfil deve aproveitar a auth atual, evitando criar uma segunda superficie paralela de identidade.

## Contracts

Rotas provaveis desta fase:

- `PATCH /api/auth/me` ou `PATCH /api/settings/profile`
- `POST /api/auth/change-password`
- `DELETE /api/auth/me`

Observacoes:

- `email` ja possui restricao `@unique`.
- exclusao de `User` pode se apoiar nos relacionamentos `onDelete: Cascade`, mas exige validacao funcional cuidadosa.

## Migrations

- Nenhuma migration e obrigatoria para nome, email e senha no estado atual do schema.
- Se houver auditoria, soft-delete ou tombstone de usuario, isso deve ser discutido antes de mudar o banco.

## UI

Superficies afetadas:

- `/settings`
- dialogs de confirmacao em contas, categorias, transacoes, recorrencias, metas e reset demo

Pontos de atencao:

- estado destrutivo precisa ser claro sem exagerar no vermelho fora de contexto;
- feedback de sucesso e erro deve ser consistente;
- exclusao da conta precisa explicar o impacto sobre todos os dados financeiros.

## Tests

- Manual
  - editar perfil e confirmar persistencia;
  - validar troca de senha e manutencao/invalidação de sessao conforme decisao tomada;
  - validar exclusao da conta em ambiente seguro;
  - validar modais de confirmacao em acoes destrutivas principais.
- Integracao
  - endpoints novos de perfil/senha/exclusao, se criados.

## Checklist

- [ ] `/settings` expandido com perfil
- [ ] Fluxo de atualizacao de dados pessoais implementado
- [ ] Fluxo de exclusao de conta definido e implementado
- [ ] Modais de confirmacao compartilhados substituindo `confirm()` e `alert()`
- [ ] Testes passando
- [ ] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Executar esta fase em duas metades:

1. criar o novo padrao de confirmacao e migrar os casos mais criticos;
2. depois expandir `/settings` com perfil e exclusao de conta, aproveitando a base de auth ja existente.
