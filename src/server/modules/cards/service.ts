/**
 * Instância do serviço de cartões ligada ao Prisma real (`@/server/db`) e ao ledger real, para
 * rotas e use-cases de outros módulos. Separado de `./index` para que testes com repositório
 * em memória não carreguem o cliente do banco.
 */
export { getCardsService } from './infra/cards-service'
