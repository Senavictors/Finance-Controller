# Credit Card Issuer Network And Brand Themed Statements

## Objetivo

Permitir que o Finance Controller trate corretamente duas identidades distintas de um cartao de credito:

- o **banco emissor** (Itau, Nubank, Bradesco, etc.);
- a **bandeira** (Visa, Mastercard, Elo, etc.).

Hoje essas duas informacoes disputam o mesmo campo visual, o que impede um cadastro fiel do cartao e dificulta evoluir a UX de faturas. Esta fase tambem deve aproveitar essa separacao para aplicar a identidade do banco emissor nos cards individuais de cartao/fatura, com fallback elegante para o tema padrao do sistema quando nao houver paleta mapeada.

## Dependencia

Depende do estado atual documentado em [CONTEXT](../CONTEXT.md), da fundacao de billing introduzida na [Phase 8 - Foundation for Analytics and Credit Card Billing](../tasks/phase-8-analytics-foundation-and-credit-card-billing.md), da registry de marcas consolidada nas [Phase 27](../tasks/phase-27-svg-brand-icons.md) e [Phase 28](../tasks/phase-28-real-brand-logo-assets.md), e do refinamento visual da [Phase 33 - Dark Theme And Theme Toggle](../tasks/phase-33-dark-theme-and-theme-toggle.md).

Tambem conversa diretamente com a pagina de faturas em `src/app/(app)/credit-cards/`, porque e nela que o ganho de leitura visual por banco faz mais sentido.

## Leitura do sistema atual

- `prisma/schema.prisma` define `Account.icon` e `Account.color`, mas nao existe um campo dedicado para a bandeira do cartao.
- `src/app/(app)/accounts/account-form.tsx` renderiza apenas um `BrandPicker` quando o tipo e `CREDIT_CARD`, misturando `bank` e `network` no mesmo controle.
- `src/app/api/accounts/route.ts` e `src/app/api/accounts/[id]/route.ts` aceitam apenas um `icon` para a conta.
- `src/app/(app)/credit-cards/page.tsx` e `src/app/(app)/credit-cards/[id]/page.tsx` exibem somente `account.icon`, sem diferenciar emissor x bandeira.
- `src/lib/brands/registry.ts` ja possui bancos e bandeiras mapeados, mas hoje essa registry funciona como identidade visual/logotipo; ela nao possui uma camada dedicada de tema para cards de fatura.
- Os cards individuais de cartao/fatura usam o tema neutro do sistema, o que preserva consistencia global, mas deixa de aproveitar a identidade do banco onde isso ajudaria a escanear a tela mais rapido.

## Principio central

Um unico campo nao deve representar duas semanticas diferentes.

Para cartoes de credito:

- **banco emissor** identifica a instituicao e deve guiar o tema do card;
- **bandeira** identifica a rede do cartao e deve aparecer como complemento visual/informacional.

## Recomendacao arquitetural

1. Manter `Account.icon` como chave visual principal da conta para preservar compatibilidade com o codigo atual e com os dados ja existentes.
2. Adicionar um novo campo opcional em `Account` para a bandeira do cartao, por exemplo `networkBrandKey`.
3. Quando `type === 'CREDIT_CARD'`, trocar o picker unico por dois campos explicitos:
   - banco emissor;
   - bandeira.
4. Derivar o tema dos cards de cartao/fatura a partir do banco emissor, nao da bandeira.
5. Manter os cards agregados da pagina de faturas com o tema padrao do sistema, porque eles representam mais de um cartao ao mesmo tempo.
6. Garantir fallback limpo para contas sem banco mapeado, preservando o design `light/dark` atual.

## Decisoes recomendadas

- `networkBrandKey` deve ser opcional para nao bloquear migracao nem cadastro rapido.
- A ausencia de bandeira nao deve impedir o cadastro do cartao.
- A ausencia de banco emissor mapeado nao deve quebrar a UI: nesse caso, usar o estilo atual baseado em `bg-card`, `border-border` e `color` de fallback.
- O tema visual deve colorir **a superficie do card**, nao o logotipo em si.
- A fonte da paleta deve ser o banco emissor; a bandeira nao deve trocar a cor-base do card.
- O ideal e adicionar um metadata opcional de tema na registry de marcas ou um resolver dedicado para `credit card theme`, evitando espalhar hexadecimais pela UI.

## Ponto de integracao no codigo atual

- `prisma/schema.prisma`
- `src/server/modules/finance/http/schemas.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/accounts/[id]/route.ts`
- `src/app/(app)/accounts/account-form.tsx`
- `src/app/(app)/accounts/account-card.tsx`
- `src/app/(app)/credit-cards/page.tsx`
- `src/app/(app)/credit-cards/[id]/page.tsx`
- `src/lib/brands/registry.ts`
- `src/lib/brands/brand-icon.tsx`

## Output esperado desta fase

- Cadastro de cartao aceitando banco emissor e bandeira em campos distintos.
- API de contas lendo e devolvendo a nova informacao de bandeira.
- Contas/cartoes existentes permanecendo funcionais sem necessidade de backfill manual.
- Cards individuais de cartao em `/credit-cards` com tema por banco emissor.
- Header/resumo do detalhe de fatura podendo reutilizar a mesma identidade visual de forma segura.
- Fallback total para o tema padrao em bancos nao mapeados.

## Fora de escopo

- Alterar a logica de billing, fechamento, vencimento ou geracao de faturas.
- Tornar banco emissor ou bandeira obrigatorios para todos os cartoes.
- Aplicar tema de banco em toda a aplicacao.
- Permitir paletas customizadas por usuario.
- Redesenhar a listagem agregada de faturas para seguir a cor de um unico banco.

## Riscos e cuidados

- Regressao em contas de cartao ja cadastradas se a migration nao preservar `icon` como emissor.
- Contraste insuficiente ao usar cores muito saturadas, especialmente no dark.
- Ambiguidade visual se o card mostrar apenas uma das duas identidades depois da migracao.
- Duplicacao de logica de cores se o tema do cartao for espalhado por paginas/componentes.

## Ordem recomendada de implementacao

1. Ajustar schema/modelagem e contratos da API.
2. Separar emissor x bandeira no form de contas.
3. Mostrar ambas as identidades nas UIs de conta/cartao.
4. Introduzir resolver de tema por banco emissor.
5. Aplicar o tema nos cards individuais de cartao/fatura.
6. Fechar com testes e validacao manual light/dark.

## Valor para portfolio

Essa fase melhora o dominio do produto e mostra cuidado com modelagem real de cartao de credito, nao apenas com cosmetica visual. Tambem adiciona uma camada de UX mais intencional: a cor passa a comunicar a instituicao correta sem sacrificar legibilidade nem a arquitetura existente.
