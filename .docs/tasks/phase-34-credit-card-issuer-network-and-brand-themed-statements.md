# Task: Phase 34 - Credit Card Issuer Network And Brand Themed Statements

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O fluxo atual de contas/cartoes possui uma limitacao estrutural: `Account.icon` esta sendo usado como unica identidade visual do cartao, mesmo quando o usuario precisa informar duas coisas diferentes:

- o banco emissor do cartao;
- a bandeira do cartao.

Na pratica isso gera um conflito de UX no cadastro: ao selecionar Itau ou Mastercard, o sistema salva ambas como se fossem a mesma "marca" do cartao. O resultado e um cadastro incompleto para casos comuns como "cartao Itau Mastercard".

Ao mesmo tempo, a pagina `src/app/(app)/credit-cards/page.tsx` ja possui cards individuais com limite, fechamento/vencimento, fatura em destaque e ultima fatura quitada, mas todos seguem o tema neutro do sistema. Existe oportunidade clara de usar a identidade do banco emissor para melhorar a leitura desses cards sem poluir os cards agregados da tela.

Referencias principais:

- `prisma/schema.prisma`
- `src/server/modules/finance/http/schemas.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/accounts/[id]/route.ts`
- `src/app/(app)/accounts/account-form.tsx`
- `src/app/(app)/accounts/account-card.tsx`
- `src/app/(app)/credit-cards/page.tsx`
- `src/app/(app)/credit-cards/[id]/page.tsx`
- `src/lib/brands/registry.ts`

## Objective

Separar banco emissor e bandeira no dominio/UI de cartoes de credito e aplicar tema visual por banco emissor nos cards individuais de cartao/fatura, com fallback seguro para o tema padrao do sistema.

## Scope

- Adicionar um campo opcional dedicado para a bandeira do cartao no model `Account`.
- Preservar `Account.icon` como identidade principal da conta para compatibilidade retroativa; para `CREDIT_CARD`, ele passa a representar o banco emissor.
- Atualizar os schemas Zod e os endpoints de contas para aceitar/devolver a nova chave de bandeira.
- Ajustar `AccountForm` para exibir dois pickers distintos quando o tipo for `CREDIT_CARD`:
  - banco emissor (`bank`);
  - bandeira (`network`).
- Revisar `AccountCard` para exibir emissor e, quando existir, bandeira.
- Ajustar `/credit-cards` para:
  - exibir o banco emissor como identidade principal do cartao;
  - exibir a bandeira como elemento complementar;
  - aplicar tema de card baseado no banco emissor apenas nos cards individuais por cartao.
- Avaliar reaproveitamento do mesmo tema no header/resumo de `/credit-cards/[id]`, desde que o contraste em `light/dark` permaneca seguro.
- Manter os cards agregados do topo da pagina de faturas no tema neutro do sistema.
- Introduzir um resolver centralizado de tema por banco emissor, evitando hexadecimais duplicados dentro das paginas.

## Out of Scope

- Redesenhar a pagina inteira de faturas.
- Alterar logica de billing, calculo de limite, geracao de statements ou pagamento.
- Tornar emissor e bandeira obrigatorios.
- Aplicar tema de banco em dashboard, contas nao-cartao ou demais modulos.
- Permitir que o usuario edite manualmente a paleta por cartao.

## Decisions

- O caminho de menor risco e **adicionar** um novo campo para bandeira, em vez de renomear/remover `icon` nesta fase.
- `Account.icon` continua existindo e, para cartoes, deve ser tratado como banco emissor.
- O nome tecnico sugerido para o novo campo e `networkBrandKey` (DB: `network_brand_key`), alinhado com a categoria `network` ja usada na brand registry.
- O tema visual do cartao deve usar o banco emissor como fonte de verdade.
- Bancos sem paleta mapeada devem continuar usando o estilo padrao `light/dark`.
- A paleta precisa respeitar contraste e nao deve transformar o card em um bloco chapado ilegivel; a recomendacao e usar composicao por `surface`, `surfaceAlt`, `foreground`, `mutedForeground`, `accent` e `border`.

## Contracts

- `POST /api/accounts`
  - aceita `networkBrandKey?: string | null` quando `type === 'CREDIT_CARD'`
- `PATCH /api/accounts/[id]`
  - aceita `networkBrandKey?: string | null`
- `GET /api/accounts`
  - passa a devolver `networkBrandKey`
- `GET /api/accounts/[id]`
  - passa a devolver `networkBrandKey`

Compatibilidade:

- contas existentes sem `networkBrandKey` continuam validas;
- `icon` continua sendo lido normalmente pelo restante do sistema;
- telas antigas que ainda nao renderizam bandeira nao devem quebrar.

## Migrations

- Criar migration para adicionar coluna opcional `network_brand_key` em `accounts`.
- Nao ha necessidade de backfill automatico obrigatorio nesta fase.
- Seed demo pode continuar funcional sem ajuste imediato, mas idealmente deve ganhar ao menos um exemplo com banco emissor + bandeira para demonstracao.

## UI

Superficies afetadas:

- `src/app/(app)/accounts/account-form.tsx`
  - trocar "Marca" unica por campos explicitos de banco emissor e bandeira ao selecionar `CREDIT_CARD`;
  - manter UX atual para contas nao-cartao.
- `src/app/(app)/accounts/account-card.tsx`
  - complementar a identidade do cartao com a bandeira quando existir.
- `src/app/(app)/credit-cards/page.tsx`
  - manter cards agregados superiores neutros;
  - aplicar tema por banco apenas nos cards individuais de cartao;
  - mostrar bandeira como selo/logo secundario.
- `src/app/(app)/credit-cards/[id]/page.tsx`
  - opcionalmente reaproveitar o tema do emissor no header/resumo principal, se a validacao visual aprovar.

Paletas iniciais sugeridas para bancos emissores:

- `nubank`: `#8A05BE`, `#FFFFFF`
- `itau`: `#FF6200`, `#000066`, `#FFFFFF`
- `bradesco`: `#E1173F`, `#FFFFFF`, `#014397`
- `bb`: `#FCFC30`, `#465FFF`, `#F4F4F6`
- `santander`: `#EA1D25`, `#000000`, `#EDEDED`
- `inter`: `#FF6E07`, `#FFFFFF`, `#161616`
- `c6`: `#FFE45C`, `#FFFFFF`, `#242429`
- `pagbank`: `#F5DE3E`, `#E4B9B9`, `#1BB99A`
- `original`: `#00A857`, `#FFFFFF`, `#1A1B1A`
- `btg`: `#195AB4`, `#05132A`, `#FFFFFF`
- `sofisa`: `#00B398`

Para emissores sem paleta mapeada:

- manter visual atual com tokens do sistema, respeitando `light/dark`.

## Tests

- Unitarios
  - schema de contas aceitando `networkBrandKey`;
  - resolver de tema por banco emissor;
  - fallback para bancos sem paleta.
- Integracao/local
  - criar/editar cartao com emissor + bandeira;
  - editar cartao legado sem bandeira;
  - validar `/credit-cards` com cartao mapeado e cartao sem paleta.
- Manual
  - criar cartao "Itau + Mastercard";
  - editar cartao "Nubank + Visa";
  - validar leitura dos cards em `light` e `dark`;
  - conferir contraste, badges, hover/focus e legibilidade do texto.

## Checklist

- [x] Migration criada
- [x] Schemas e APIs de contas atualizados
- [x] Form de contas separado em emissor + bandeira
- [x] Cards de contas/cartoes exibindo ambas as identidades
- [x] Tema por banco aplicado aos cards individuais de fatura
- [x] Fallback para tema padrao validado
- [x] Testes passando
- [x] `.docs/CONTEXT.md` updated
- [x] `README.md` updated (roadmap/backlog/phases/proximo passo when applicable)
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Result

- `prisma/schema.prisma` ganhou `Account.networkBrandKey` e a migration `20260420220000_add_account_network_brand_key` foi criada/aplicada, preservando `Account.icon` como banco emissor.
- `createAccountSchema` e `updateAccountSchema` passaram a aceitar `icon`/`networkBrandKey` nulos, e as rotas `POST /api/accounts` e `PATCH /api/accounts/[id]` agora limpam `networkBrandKey` automaticamente quando a conta deixa de ser `CREDIT_CARD`.
- `src/app/(app)/accounts/account-form.tsx` separou o cadastro de cartao em dois `BrandPicker`s distintos: `Banco emissor` (`bank`) e `Bandeira` (`network`), mantendo o fluxo antigo para contas nao-cartao.
- `src/lib/brands/credit-card-theme.ts` centralizou as paletas por banco emissor e expoe helpers de surface, accent, glow e chip; `BrandChip` foi adicionado para reutilizar a exibicao compacta de emissor/bandeira.
- `src/app/(app)/credit-cards/page.tsx` agora aplica tema por banco apenas nos cards individuais de cartao, mantendo os cards agregados neutros; o historico de faturas tambem passou a exibir emissor + bandeira juntos.
- `src/app/(app)/credit-cards/[id]/page.tsx` reaproveita a identidade do emissor no header/resumo principal da fatura sem alterar o fluxo de pagamento.
- `prisma/seed.ts` e `src/app/api/settings/reset-demo/route.ts` agora geram o cartao demo com emissor `nubank` e bandeira `mastercard`, tornando a feature demonstravel por padrao.
- Cobertura adicionada em `src/lib/brands/credit-card-theme.test.ts` e `src/server/modules/finance/http/schemas.test.ts`.
- Checks executados com sucesso: `npx prisma generate`, `npm run format`, `npm test`, `npm run lint` e `npm run build`.

## Notes for AI (next step)

Depois desta entrega, a prioridade natural e validar visualmente em browser real os cards tematizados de `/credit-cards` e o resumo de `/credit-cards/[id]` em `light` e `dark`, observando contraste de texto, badges, chips e logos rasterizados. Se surgirem novos emissores relevantes no uso real, o proximo passo pequeno e expandir o mapa em `src/lib/brands/credit-card-theme.ts`.
