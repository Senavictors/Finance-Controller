/**
 * CLI do guard de dados reais.
 *   npx tsx scripts/guard-data.ts            varre o repositório inteiro
 *   npx tsx scripts/guard-data.ts --staged   varre só os arquivos staged (usado no pré-commit)
 * Sai com código 1 se houver achados (o trecho é mascarado para não vazar em logs).
 */
import { formatFinding, scanRepo, scanStaged } from '../tests/guards/scan'

const root = process.cwd()
const staged = process.argv.includes('--staged')
const result = staged ? scanStaged(root) : scanRepo(root)

if (result.violations.length === 0 && result.allowlistErrors.length === 0) {
  console.log(`guard:data OK (${result.scannedFiles} arquivo(s) verificado(s))`)
  process.exit(0)
}

console.error('guard:data FALHOU: possível dado real no repositório (Constituição).')
for (const v of result.violations) console.error(`  - ${formatFinding(v)}`)
for (const e of result.allowlistErrors) console.error(`  - ${e}`)
console.error('Corrija o dado (use dados sintéticos/`private/`); não relaxe o detector.')
process.exit(1)
