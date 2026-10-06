# Wishlist Module And Purchase Conversion

## Objetivo

Adicionar ao produto um modulo dedicado de lista de compras desejadas, separado de metas financeiras, mas conectado ao fluxo real de despesa quando a compra acontecer.

O foco do MVP e permitir que o usuario:

- cadastre itens desejados com contexto suficiente para decisao;
- acompanhe prioridade, status e datas planejadas;
- agrupe visualmente esses itens em cards;
- converta um item comprado em transacao real sem sair do modulo.

## Leitura do sistema atual

- O produto ja possui CRUDs completos de contas, categorias, transacoes e metas.
- `Transaction` ja e o centro da verdade financeira e dispara invalidacao analitica.
- `Goal` cobre planejamento financeiro agregado, mas nao representa bem desejos de compra individuais.
- O padrao atual de UI para listas em cards com modal de criacao/edicao esta bem representado em `/goals`.
- O fluxo de compra nao deve depender de redirecionamento para `/transactions`, porque a pagina atual nao trabalha com prefill contextual robusto.

## Recomendacao arquitetural

O modulo deve nascer como concern proprio dentro de `wishlist`, e nao como extensao de `goals`.

Motivos:

- um item desejado e um objeto concreto de decisao, nao uma meta agregada;
- o dominio exige campos proprios (`productUrl`, `desiredPrice`, `paidPrice`, `desiredPurchaseDate`, `purchasedAt`);
- a conversao em compra e um workflow operacional, nao apenas um calculo analitico.

## Modelo recomendado

```prisma
enum WishlistItemPriority {
  LOW
  MEDIUM
  HIGH
}

enum WishlistItemStatus {
  DESIRED
  MONITORING
  READY_TO_BUY
  PURCHASED
  CANCELED
}

model WishlistCategory {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
}

model WishlistItem {
  id                    String               @id @default(cuid())
  userId                String               @map("user_id")
  categoryId            String?              @map("category_id")
  name                  String
  desiredPrice          Int                  @map("desired_price")
  paidPrice             Int?                 @map("paid_price")
  productUrl            String?              @map("product_url")
  priority              WishlistItemPriority @default(MEDIUM)
  status                WishlistItemStatus   @default(DESIRED)
  desiredPurchaseDate   DateTime?            @map("desired_purchase_date")
  purchasedAt           DateTime?            @map("purchased_at")
  purchaseTransactionId String?              @unique @map("purchase_transaction_id")
  createdAt             DateTime             @default(now()) @map("created_at")
  updatedAt             DateTime             @updatedAt @map("updated_at")
}
```

## Regras de negocio sugeridas

- `desiredPrice` e sempre obrigatorio e armazenado em centavos.
- `paidPrice` e `purchasedAt` so passam a existir no momento da compra real.
- `PURCHASED` nao deve ser um status arbitrario de edicao; ele nasce do fluxo de compra.
- `CANCELED` bloqueia compra ate que o item volte para um status ativo.
- `purchaseTransactionId` guarda a ligacao entre wishlist e despesa real.

## API recomendada

- `GET /api/wishlist/categories`
- `POST /api/wishlist/categories`
- `GET /api/wishlist/items`
- `POST /api/wishlist/items`
- `PATCH /api/wishlist/items/[id]`
- `DELETE /api/wishlist/items/[id]`
- `POST /api/wishlist/items/[id]/purchase`

### Contrato de compra

O endpoint `/purchase` deve receber:

- `accountId`
- `categoryId?` financeiro
- `amount`
- `date`
- `notes?`

E deve:

1. validar ownership da conta e da categoria financeira;
2. criar `Transaction` do tipo `EXPENSE`;
3. sincronizar billing de cartao quando a conta for `CREDIT_CARD`;
4. atualizar o item para `PURCHASED`;
5. invalidar snapshots analiticos como qualquer despesa.

## UI recomendada

- Nova rota autenticada `/wishlist`
- Cards agrupados por status, nao kanban
- Modal de criar/editar item
- Criacao rapida de categoria propria dentro do modal
- Modal de compra curto dentro do proprio card
- Filtros leves por status, prioridade, categoria e busca por nome

Cada card do MVP deve exibir:

- nome do produto
- categoria propria
- preco desejado
- preco pago quando houver
- link do produto
- prioridade
- status
- data desejada
- data efetiva da compra

## Ordem recomendada de implementacao

1. Modelar `WishlistCategory` e `WishlistItem` no Prisma
2. Criar schemas Zod e use cases do modulo
3. Expor as rotas de categorias, itens e compra
4. Construir a pagina `/wishlist`
5. Integrar sidebar, seed e reset demo
6. Cobrir com testes de schema e compra atomica

## Riscos e cuidados

- Nao transformar `goals` em deposito de responsabilidades de wishlist
- Garantir multi-tenant em todas as queries
- Bloquear compra de item cancelado ou ja comprado
- Evitar marcar `PURCHASED` sem criar a transacao real
- Preservar demo forte para portfolio, com itens ativos e um item ja comprado

## Valor para portfolio

Essa feature cria uma ponte clara entre planejamento de consumo e execucao financeira real. Ela mostra modelagem de dominio, UX centrada em fluxo e integracao entre CRUD, analytics e billing sem precisar recorrer a overengineering.
