/**
 * Instância do serviço do ledger ligada ao Prisma real (`@/server/db`), para use-cases e rotas
 * de outros módulos. Separado de `./index` para que testes com repositório em memória não
 * carreguem o cliente do banco.
 */
export { getLedgerService } from './infra/ledger-service'
