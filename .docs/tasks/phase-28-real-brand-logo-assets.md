# Task: Phase 28 - Real Brand Logo Assets

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

A Phase 27 colocou em producao uma registry central de marcas em `src/lib/brands/registry.ts`, mas os SVGs atuais foram desenhados manualmente e nao representam bem as logos reais das empresas.

Para corrigir isso, foi montado um inventario local em `system-images/logos/` com logos extraidas manualmente. Hoje esse inventario e heterogeneo: ha arquivos `png` e `jpeg`, e nenhuma garantia de que todas as marcas existam em `svg`.

O componente atual `src/lib/brands/brand-icon.tsx` renderiza apenas SVG inline vindo do campo `brand.svg`, o que significa que a troca para assets reais vai exigir uma evolucao do contrato interno da registry, mas sem quebrar os `brandKey`s ja persistidos no banco.

Inventario levantado neste ciclo:

- `system-images/logos/` contem 33 arquivos.
- Distribuicao por formato: 24 `jpeg`, 9 `png`, 0 `svg`.
- Cobertura frente ao registry atual: 33 de 35 marcas possuem algum arquivo mapeavel.
- Marcas faltantes no inventario atual: `Neon` e `Pix`.

Mapeamento identificado entre o inventario e o registry atual:

- Bancos presentes: Banco do Brasil, Itau, Bradesco, Caixa, Santander, Nubank, Banco Inter, C6 Bank, PagBank, Original, BTG Pactual, Sofisa Direto.
- Bandeiras presentes: Visa, Mastercard, Elo, American Express, Hipercard.
- Pagamentos presentes: PayPal.
- Assinaturas presentes: Netflix, Amazon Prime Video, Disney+, HBO Max, Spotify, Google One, iCloud, Microsoft 365, Adobe Creative Cloud, Canva, YouTube Premium, Globoplay, Deezer, Apple Music, Paramount+.

Arquivos que exigem normalizacao de naming durante a implementacao:

- `system-images/logos/bradeco.jpeg` deve virar o asset final de `bradesco`.
- `system-images/logos/banco-inter.jpeg` deve mapear para `inter`.
- `system-images/logos/banco-original.png` deve mapear para `original`.
- `system-images/logos/caixa-economica.jpeg` deve mapear para `caixa`.
- `system-images/logos/google.jpeg` deve mapear para `googleone`.
- `system-images/logos/microsoft.png` deve mapear para `ms365`.
- `system-images/logos/hbo.jpeg` deve mapear para `hbomax`.

Referencias principais:

- `system-images/logos/`
- `src/lib/brands/registry.ts`
- `src/lib/brands/brand-icon.tsx`
- `src/lib/brands/brand-picker.tsx`
- `.docs/tasks/phase-27-svg-brand-icons.md`

## Objective

Substituir os SVGs artesanais do registry por logos reais extraidas localmente, aceitando `svg`, `png` e `jpeg` como fontes validas, sem alterar as chaves de marca que ja circulam pelo app e pelo banco.

## Scope

- Catalogar e consolidar o inventario de `system-images/logos/`.
- Definir um destino estavel para os assets finais por chave de marca, preferencialmente algo como `public/brands/<brand-key>.<ext>`.
- Evoluir a registry para referenciar assets locais em vez de depender exclusivamente de `svg` inline.
- Adaptar `BrandIcon` e `BrandDot` para renderizar logos reais com tratamento consistente de fundo, borda, padding e legibilidade.
- Preservar `matchBrand`, `resolveBrand` e os `brandKey`s atuais.
- Manter fallback visual coerente para marcas sem asset final disponivel.
- Cobrir a nova camada com testes de mapping/cobertura e regressao do componente.

## Out of Scope

- Buscar logos faltantes em APIs, CDNs ou servicos externos.
- Adicionar novas marcas fora do registry atual.
- Alterar o schema Prisma ou migrar valores de `icon` ja persistidos.
- Refatorar fluxos de negocio que nao estejam diretamente ligados a renderizacao das marcas.
- Resolver nesta fase a curadoria legal/licenciamento das logos alem do uso local no projeto.

## Decisions

- `icon` continua armazenando apenas a chave semantica da marca, por exemplo `nubank`, `visa`, `spotify`.
- `system-images/logos/` deve ser tratado como inventario de origem; a implementacao deve promover os arquivos curados para um caminho estavel dentro do app.
- A registry deve passar a suportar metadata de asset local, por exemplo `src`, `kind`, `padding`, `fit`, `border`, mantendo o contrato publico dos componentes o mais estavel possivel.
- `svg` deixa de ser obrigatorio. `png` e `jpeg` sao formatos aceitos de primeira classe.
- Marcas sem asset real no momento da implementacao podem continuar usando o fallback atual temporariamente, desde que isso fique explicito e coberto por teste.

## Contracts

Contratos externos do sistema nao precisam mudar:

- `Account.icon` e `Category.icon` continuam persistindo apenas a chave da marca.
- APIs de contas e categorias continuam aceitando `icon?: string`.
- `matchBrand()` e `resolveBrand()` devem preservar o comportamento atual de inferencia.

Contrato interno sugerido para a implementacao:

- `Brand` continua expondo `key`, `name`, `category`, `bg`, `fg`, `border?`.
- Novo bloco opcional `asset`:
  - `src: string`
  - `kind: 'svg' | 'png' | 'jpeg'`
  - `fit?: 'contain' | 'cover'`
  - `padding?: number`
  - `border?: boolean`
- `BrandIcon` deve manter a mesma interface publica atual (`brandKey`, `fallbackLabel`, `fallbackText`, `fallbackColor`, `size`, `radius`, `className`, `title`).

## Migrations

- Nenhuma migration de banco e necessaria.
- Nao deve haver backfill obrigatorio de dados para iniciar a migracao visual.
- Se algum asset final for renomeado, a mudanca deve ocorrer apenas no catalogo interno, nunca nos `brandKey`s persistidos.

## UI

Superficies que vao refletir a troca quando a implementacao acontecer:

- `BrandIcon`, `BrandDot` e `BrandPicker`.
- formularios de contas e categorias.
- selects e listas de transacoes, recorrencias e metas.
- cards de contas.
- paginas e tabelas de cartoes/faturas.
- widgets do dashboard que hoje usam `BrandIcon` ou `BrandDot`.

Pontos de atencao visual:

- logos claras sobre fundo claro.
- logos escuras sobre fundo escuro.
- arquivos raster com muito respiro ou fundo branco.
- consistencia entre tamanho pequeno (`BrandDot`) e avatar maior (`BrandIcon`).

## Tests

- Unitarios
  - garantir que todo `brandKey` com asset catalogado resolve para um arquivo local valido.
  - garantir que `matchBrand()` e `resolveBrand()` nao perdem cobertura atual.
  - garantir fallback explicito para `Neon` e `Pix` enquanto nao houver asset real.
- Componentes
  - `BrandIcon` renderiza asset local quando houver `asset`.
  - `BrandIcon` cai para fallback textual/cromatico quando nao houver asset.
  - `BrandDot` continua funcionando em tamanhos pequenos sem regressao visual severa.
- Manual
  - validar contas, categorias, transacoes, recorrencias, metas, credit cards e dashboard.
  - validar light mode, dark mode e mobile.

## Checklist

- [x] Inventario de logos normalizado para nomes finais estaveis
- [x] Assets promovidos para caminho final versionado pelo app
- [x] Registry migrada de SVG artesanal para metadata de asset
- [x] `BrandIcon` e `BrandDot` adaptados para `svg`/`png`/`jpeg`
- [x] Fallbacks documentados para marcas ainda sem asset real
- [x] Testes passando
- [x] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Sequencia recomendada para implementacao:

1. Curar os arquivos de `system-images/logos/` e copiar apenas os aprovados para um destino estavel por `brandKey`.
2. Evoluir o tipo `Brand` para suportar asset local sem quebrar os consumidores atuais.
3. Adaptar `BrandIcon` primeiro e depois validar `BrandDot`, porque os problemas de legibilidade costumam aparecer mais forte no tamanho pequeno.
4. Fechar com teste de cobertura do inventario para evitar regressao silenciosa quando novas marcas forem adicionadas ao registry.

Inventario faltante no fechamento desta task:

- Neon
- Pix
