---
id: FC2-F4-01
title: Pipeline de importação + ImportBatch + importHash + OFX/CSV
status: backlog
type: feature
phase: F4
wave: 1
owner: ia-integracoes
depends_on: [FC2-F1-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [imports, ledger, accounts, merchants]
related_use_cases: []
related_adrs: [ADR-023, ADR-002, ADR-019, ADR-024, ADR-016]
---

# FC2-F4-01 — Pipeline de importação + ImportBatch + importHash + OFX/CSV

## Contexto
O FC 1.x não tem importação: todo lançamento é digitado. A meta da F4 é "fechar o mês importando extratos em cerca de 10 minutos" (especificação §10). Esta task cria o **esqueleto reutilizável** da importação (ADR-023): recebe um arquivo, detecta o formato, converte em linhas normalizadas, calcula um hash determinístico para deduplicação, enriquece e grava no Inbox (`review = NEEDS_REVIEW`). As tasks seguintes plugam nele: F4-02 (parsers PDF), F4-03 (normalização/regras como enriquecedor), F4-04 (matching), F4-05/F4-06 (telas).

Restrição de privacidade: **o arquivo do usuário nunca é gravado** no servidor (nem disco, nem `/tmp`, nem Vercel Blob). Tudo é processado em memória a partir do `Buffer` da requisição.

## Problema
Sem importação o usuário precisa lançar manualmente dezenas de linhas por mês; sem `importHash` reimportar um arquivo com período sobreposto duplica lançamentos; sem `ImportBatch` não há como desfazer uma importação errada nem mostrar "N novos, M duplicados".

## Objetivo
Entregar o módulo `src/server/modules/imports/` com:
1. Pipeline `upload → detectar formato → parse → normalizar → importHash → dedupe → enriquecer → Inbox`.
2. Parsers de **OFX** (SGML 1.x e XML 2.x) e **CSV** com **mapeamento salvo por banco/conta**.
3. Modelo `ImportBatch` (com contagens) e `ImportMapping`.
4. Endpoints `POST /api/imports` (com `dryRun`), `GET /api/imports`, `GET /api/imports/[id]`, `POST /api/imports/[id]/undo` e `GET/PUT /api/import-mappings`.
5. Contratos (`ParsedRow`, `ParseResult`, `ImportParser`) que a F4-02 implementa para PDF.

## Fora de escopo
- Parsers PDF (F4-02), regras e normalização de merchant (F4-03; aqui só o gancho `Enricher`), matching com PLANNED/manuais e detecção de transferência (F4-04), telas (F4-05, F4-06), IA (F5).
- Open Finance (F7-01 reaproveita este pipeline).
- Importação de arquivos de investimento, QIF, XLSX.

## Comportamento atual
Não existe nada de importação. Em `src/server/modules/finance/` do 1.x só há CRUD de transações; não há `importHash`, `ImportBatch` nem `Merchant`. O schema 2.0 (F0-02) já prevê `Transaction.importHash` (único por usuário), `Transaction.source = IMPORT`, `Transaction.review`, `Transaction.rawDescription` e o enum `ImportBatch.kind` (OFX, CSV, PDF_*). Verifique o `prisma/schema.prisma` real antes de começar e ajuste esta task às diferenças.

## Comportamento esperado
Fluxo (cada seta é uma função pura ou um use-case, na ordem):

```text
multipart upload (arquivo em memória, até 4 MB)
  → detectFormat(buffer, hintKind?)          domain/detect-format.ts
  → parser.parse(buffer, ctx)                domain/parsers/{ofx,csv}.ts   → ParsedRow[]
  → normalizeRows(rows, account)             domain/normalize-rows.ts      → NormalizedRow[] (data meio-dia UTC, centavos com sinal)
  → computeImportHashes(rows, accountId)     domain/import-hash.ts         → hash + ocorrência
  → dedupe(rows, existingHashes)             application/dedupe.ts         → novas | duplicadas
  → enrich(rows)                             Enricher (gancho; F4-03 pluga)
  → persist (ledger use-case)                application/commit-import.ts  → Transaction NEEDS_REVIEW + ImportBatch
```

Resposta de `POST /api/imports` (`multipart/form-data`: `file`, `accountId`, opcionais `kind`, `mappingId`, `dryRun`, `password`):

```json
{
  "batchId": "ckx...",
  "kind": "OFX",
  "status": "PROCESSED",
  "counts": { "total": 42, "new": 37, "duplicate": 4, "ignored": 1, "error": 0 },
  "warnings": [],
  "period": { "from": "2026-09-01", "to": "2026-09-30" }
}
```

Com `dryRun=true` nada é gravado (nem `ImportBatch`): devolve as mesmas contagens com `status: "PREVIEW"` e `batchId: null`.

Se for CSV sem mapeamento aplicável: `422` com `{ "code": "MAPPING_REQUIRED", "headers": [...], "sampleRows": [...até 5], "suggestedMapping": {...} }`. A tela F4-06 pede confirmação e grava via `PUT /api/import-mappings`.

### Contratos (`src/server/modules/imports/domain/types.ts`)
```ts
export type ImportKind =
  | 'OFX' | 'CSV'
  | 'PDF_ITAU_EXTRATO' | 'PDF_ITAU_FATURA'
  | 'PDF_NUBANK_EXTRATO' | 'PDF_NUBANK_FATURA'

export interface ParsedRow {
  date: Date                 // meio-dia UTC (ADR-002)
  amountCents: number        // inteiro com sinal: despesa < 0, receita > 0
  description: string        // texto bruto limpo (trim, espaços colapsados, máx. 200)
  balanceCents?: number      // saldo após a linha, quando o arquivo traz
  externalId?: string        // FITID do OFX etc. (não entra no importHash)
  hints?: ParsedRowHints     // dicas de parsers específicos (F4-02)
}
export interface ParsedRowHints {
  kind?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'CARD_PAYMENT' | 'FEE' | 'INTEREST'
  merchantRaw?: string
  counterpartyType?: 'PERSON' | 'COMPANY'
  installment?: { current: number; total: number }
  marker?: 'DEBT_DISBURSEMENT' | 'PIX_CREDIT' | 'INTERNATIONAL'
  city?: string
  categoryHint?: string
}
export interface ParseResult {
  kind: ImportKind
  rows: ParsedRow[]
  warnings: ImportWarning[]
  unparsedLines?: number
  statement?: ParsedStatementMeta   // preenchido só por faturas (F4-02)
}
export interface ImportWarning { code: string; message: string; line?: number }
export interface ParsedStatementMeta {
  closingDate?: Date; dueDate?: Date; periodStart?: Date; periodEnd?: Date
  totalCents?: number; minPaymentCents?: number
  creditLimitCents?: number; availableLimitCents?: number
}
export interface ImportParser {
  kind: ImportKind
  detect(buffer: Buffer, hintName?: string): number   // confiança 0..1
  parse(buffer: Buffer, ctx: ParseContext): ParseResult | Promise<ParseResult>
}
export interface ParseContext { accountId: string; mapping?: CsvMapping; password?: string; now: Date }
```
`ParseResult` e `ImportParser` são o contrato que a F4-02 implementa; não os altere depois sem avisar.

## Regras de negócio
- RN-01: **Arquivo nunca persistido.** Usar `request.formData()` e `Buffer.from(await file.arrayBuffer())`; proibido `fs.writeFile`, `os.tmpdir()`, Vercel Blob, S3. O `ImportBatch` guarda no máximo `fileSha256` e `fileSizeBytes` (nunca nome do arquivo, nem conteúdo, nem linhas brutas).
- RN-02: Limite de **4 MB** por arquivo (a Vercel limita o corpo de funções a ~4,5 MB). Acima: `413 FILE_TOO_LARGE`.
- RN-03: **importHash determinístico:** `{contaId}:{AAAA-MM-DD}:{centavosComSinal}:{descricaoNormalizada}:{ocorrencia}`. Exemplo fictício: `acc_01:2026-09-12:-4290:UBER TRIP:1`.
  - `contaId` = id da conta de destino escolhida pelo usuário.
  - `data` = data de calendário da linha (a mesma usada em `Transaction.date`, meio-dia UTC), formatada em UTC.
  - `centavosComSinal` = `amountCents` inteiro com sinal.
  - `descricaoNormalizada` = função `normalizeForHash(description)`: maiúsculas, sem acentos (NFD + remoção de marcas), `:` e demais pontuações viram espaço, espaços colapsados, trim, truncado em 40 caracteres. **Não** remove dígitos (distingue "LOJA 12" de "LOJA 21"). Esta função é congelada: mudar quebra a deduplicação de tudo que já foi importado; qualquer alteração exige ADR e migração de hashes.
  - `ocorrencia` = contador (1, 2, 3...) para linhas idênticas (mesma conta, data, valor, descrição) **dentro do mesmo arquivo**, na ordem em que aparecem. Duas compras iguais no mesmo dia geram `:1` e `:2`.
  - `externalId` (FITID) não entra no hash, porque nem todo banco o mantém estável entre exportações; fica em metadado para diagnóstico.
- RN-04: **Dedupe:** linha cujo `importHash` já existe para o `userId` é `duplicate` e não é gravada. Além do índice único `@@unique([userId, importHash])`, a gravação usa `createMany({ skipDuplicates: true })` para tolerar corrida entre duas importações simultâneas.
- RN-05: **Mesmo arquivo (mesmo `fileSha256`).** Como `ImportBatch` é único por `[userId, fileSha256]`: se já existe lote `PROCESSED` com o mesmo hash, **não** criar outro; devolver o resumo do lote existente com aviso `FILE_ALREADY_IMPORTED`, `counts.new = 0` e `counts.duplicate = total` (sem reprocessar). Se o lote existente está `UNDONE` ou `FAILED`, reaproveitar a mesma linha de `ImportBatch` (reset das contagens, `status` volta a `PENDING` e depois `PROCESSED`) e reprocessar. Arquivos **diferentes** com período sobreposto são tratados pelo `importHash` linha a linha (RN-03/RN-04).
- RN-06: Toda linha nova vira `Transaction` com `source = IMPORT`, `review = NEEDS_REVIEW`, `status = CLEARED` (extrato/OFX de conta), `rawDescription` = descrição bruta, `importBatchId`, `importHash` e `categorySource = IMPORT` (vira `MERCHANT`/`RULE` quando o `Enricher` categoriza; enum da F0-02: `USER, RULE, MERCHANT, LLM, PARSER, IMPORT`). Nada importado é considerado "revisado" até o usuário confirmar no Inbox (F4-05).
- RN-07: Toda gravação passa por use-case do ledger da F1-01 (`createTransaction` em `src/server/modules/ledger/application/`), nunca `prisma.transaction.create` direto, para o `AccountBalance` ser atualizado (ADR-019). O use-case recebe o **módulo** do valor e aplica o sinal pelo `kind`: linha negativa vira `EXPENSE` (ou `FEE`/`INTEREST` quando `hints.kind` indica e o sinal é negativo), linha positiva vira `INCOME`; `hints.kind` incompatível com o sinal é ignorado com aviso. `TRANSFER` e `CARD_PAYMENT` **não** são criados aqui (a F4-04 os liga como par; até lá entram como `EXPENSE`/`INCOME`). Para conta `CREDIT_CARD` (faturas, F4-02) usar o use-case de compra no cartão da F2-03/F1-03 (`src/server/modules/cards/application/create-card-purchase.ts`) com 1 parcela e `statementKey` vinda do arquivo; se a assinatura não permitir, criar adaptador em `imports/infra/` e registrar em "Divergências". Só `ImportBatch` e `ImportMapping` são gravados direto pelo módulo `imports`.
- RN-08: Gravação do lote é **atômica** (`prisma.$transaction`): ou grava `ImportBatch` + todas as transações novas, ou nada. Linhas com erro de parse não derrubam o lote: contam em `counts.error` (`errorCount`) e geram `warnings`, mas se **todas** falharem o lote termina `FAILED` sem gravar transações.
- RN-09: Linhas com `amountCents = 0` são ignoradas (`counts.ignored`) com aviso `ZERO_AMOUNT`.
- RN-10: **Detecção de formato** (`detectFormat`) por conteúdo, não por extensão: texto iniciando em `OFXHEADER:` ou contendo `<OFX>` → OFX (variante SGML se não houver `<?xml`); bytes `%PDF` → PDF (delegar aos detectores da F4-02, que devolvem confiança); caso contrário, se decodifica como texto com delimitador consistente em ≥ 80% das linhas → CSV. Se o usuário informou `kind`, vale o `kind`. Empate ou confiança < 0.5 → `422 FORMAT_NOT_RECOGNIZED`.
- RN-11: **OFX.** Aceitar SGML (tags sem fechamento, cabeçalho `KEY:VALUE`) e XML. Ler `CHARSET`/encoding do cabeçalho (`1252` → `windows-1252`, senão UTF-8) com `TextDecoder`. Blocos `STMTTRN` em `BANKTRANLIST` (conta) e `CCSTMTTRNRS` (cartão). Campos: `DTPOSTED` (`AAAAMMDD[HHMMSS[.XXX][offset]]`, usar só a data), `TRNAMT` (aceitar `.` ou `,` decimal; já vem com sinal), `FITID`, `MEMO`, `NAME`, `TRNTYPE`. Descrição = `MEMO` se existir, senão `NAME`; se ambos existirem e diferirem, `NAME + ' ' + MEMO` (sem duplicar). `LEDGERBAL` vira `warning` de conferência, não lançamento. Número de conta/agência do arquivo **não** é armazenado nem logado.
- RN-12: **CSV.** Mapeamento (`CsvMapping`, validado por Zod): `delimiter` (`;` `,` `\t`), `encoding` (`utf-8` | `windows-1252`), `skipRows`, `hasHeader`, `dateColumn`, `dateFormat` (`dd/MM/yyyy` | `yyyy-MM-dd` | `dd/MM/yy`), `descriptionColumn`, `amountMode` (`SIGNED` | `DEBIT_CREDIT` | `ABS_WITH_TYPE`), `amountColumn`, `debitColumn`, `creditColumn`, `typeColumn` + `typeDebitValues`, `invertSign`, `decimalSeparator` (`,` | `.`), `thousandsSeparator`. Parser próprio de CSV com aspas (RFC 4180), sem dependência nova. Valor: reaproveitar `parseMoneyToCents` de `src/lib/money.ts` (1.x), estendendo-o se não aceitar sinal ou `R$`.
- RN-13: **Mapeamento salvo por banco:** `ImportMapping { id, userId, name, issuerKey?, accountId?, config Json }`. Ao importar CSV, ordem de escolha: `mappingId` explícito → mapeamento da `accountId` → mapeamento do `issuerKey` da conta → `MAPPING_REQUIRED`. `suggestedMapping` usa heurística por nome de cabeçalho (`data`/`date`; `descri`/`histórico`/`memo`; `valor`/`amount`; `débito`/`crédito`).
- RN-14: `Enricher` é uma interface `(row, ctx) => EnrichedRow`. Nesta task a implementação padrão chama a memória de merchant da F2-02 (merchant + categoria padrão, `categorySource = MERCHANT`) quando existir, senão devolve a linha intacta. A F4-03 troca a implementação por normalização + regras sem alterar o pipeline.
- RN-15: **Undo do lote:** `POST /api/imports/[id]/undo` apaga (via use-case do ledger) apenas as transações do lote que ainda estão `NEEDS_REVIEW` e sem `userLocked`; transações já confirmadas/editadas permanecem e são contadas em `kept`. Lote passa a `UNDONE`. Só vale para lote `PROCESSED`.
- RN-16: Segurança: rota exige sessão (`src/server/auth/guard.ts`); `accountId` precisa pertencer ao `userId`; rate limit com `src/server/auth/rate-limit.ts` (10 uploads/min); logs estruturados **sem** descrição, valores ou nomes (só `batchId`, `kind`, contagens, duração).

## Critérios de aceitação
- [ ] CA-01: `POST /api/imports` com o fixture OFX SGML sintético grava `ImportBatch` `PROCESSED` e as transações esperadas, todas `source = IMPORT`, `review = NEEDS_REVIEW`.
- [ ] CA-02: O mesmo upload repetido devolve `counts.new = 0` e `counts.duplicate = total`, e o número de `Transaction` no banco não muda.
- [ ] CA-03: Dois lançamentos idênticos no mesmo dia/valor/descrição geram hashes terminando em `:1` e `:2` e ambos são gravados; reimportando, ambos são duplicados.
- [ ] CA-04: Arquivo OFX XML e OFX SGML equivalentes produzem a mesma lista de `ParsedRow` (testado por comparação).
- [ ] CA-05: CSV com `;`, vírgula decimal, datas `dd/MM/yyyy` e coluna única de valor com sinal é importado com mapeamento salvo; sem mapeamento devolve `422 MAPPING_REQUIRED` com `suggestedMapping`.
- [ ] CA-06: CSV com colunas separadas de débito e crédito produz sinais corretos (débito negativo, crédito positivo).
- [ ] CA-07: `dryRun=true` não cria `ImportBatch` nem `Transaction`.
- [ ] CA-08: Nenhum arquivo é escrito em disco: teste espiona `fs`/`fs/promises` e falha se `writeFile`/`createWriteStream` for chamado durante o upload; `grep -rn "tmpdir\|writeFile" src/server/modules/imports` retorna vazio.
- [ ] CA-09: Arquivo > 4 MB retorna `413`; arquivo de formato desconhecido retorna `422 FORMAT_NOT_RECOGNIZED`.
- [ ] CA-10: Undo remove só transações `NEEDS_REVIEW` do lote e informa `kept` para as demais.
- [ ] CA-11: `importHash` de uma linha fixa é igual ao literal esperado no teste (golden test), garantindo que a função não muda sem querer.
- [ ] CA-12: `npm run lint`, `npm test` e `npx next build` passam; nenhum fixture contém dado real.

## Impacto técnico
### Backend
Estrutura nova (arquivos a criar):
- `src/server/modules/imports/domain/types.ts`, `detect-format.ts`, `import-hash.ts`, `normalize-rows.ts`, `csv-mapping.ts`
- `src/server/modules/imports/domain/parsers/ofx.ts`, `csv.ts`, `registry.ts` (lista de `ImportParser`; a F4-02 só adiciona entradas)
- `src/server/modules/imports/application/import-file.ts` (orquestra o pipeline, com `dryRun`), `dedupe.ts`, `commit-import.ts`, `undo-import.ts`, `list-imports.ts`, `mappings.ts`, `enricher.ts`
- `src/server/modules/imports/infra/import-batch-repository.ts`, `import-mapping-repository.ts`
- `src/server/modules/imports/http/schemas.ts` (Zod: `importRequestSchema`, `csvMappingSchema`, `importResponseSchema`)
- `src/app/api/imports/route.ts` (POST, GET), `src/app/api/imports/[id]/route.ts` (GET), `src/app/api/imports/[id]/undo/route.ts` (POST), `src/app/api/import-mappings/route.ts` (GET, PUT)
- Route Handlers finos: `export const runtime = 'nodejs'`; `export const maxDuration = 30`.

Reaproveitar do 1.x: `src/lib/money.ts` (`parseMoneyToCents`), padrão de datas ao meio-dia UTC de `src/server/modules/finance/http/schemas.ts`, `src/server/auth/guard.ts` e `rate-limit.ts`.

### Frontend
Nenhum nesta task (F4-06 consome os endpoints).

### Banco de dados
Coordenar com o papel `dados-prisma` (migration aditiva `add_import_pipeline`). A F0-02 **já criou** `ImportBatch` (`kind`, `accountId?`, `fileSha256`, `fileLabel?`, `periodStart?`, `periodEnd?`, `totalRows`, `newCount`, `duplicateCount`, `matchedCount`, `errorCount`, `status ImportStatus` com `PENDING | PROCESSED | FAILED | UNDONE`, `errorLog Json?`, `@@unique([userId, fileSha256])`) e, em `Transaction`, `importBatchId`, `importHash` (`@@unique([userId, importHash])`), `rawDescription`, `categorySource`, `userLocked`. **Não recriar.** Conferir o schema real e acrescentar apenas:
```prisma
model ImportBatch {
  // campos existentes da F0-02 ...
  ignoredCount  Int      @default(0)
  warnings      Json     @default("[]")
  undoneAt      DateTime?
}

model ImportMapping {
  id        String   @id @default(cuid())
  userId    String
  name      String
  issuerKey String?
  accountId String?
  config    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, name])
}
```
Como `ImportBatch` é único por `[userId, fileSha256]`, **um mesmo arquivo nunca gera dois lotes**: ver RN-05. `fileLabel` recebe um rótulo gerado (por exemplo "Extrato OFX", "Fatura Nubank (PDF)"), **nunca** o nome do arquivo enviado. Valores do `status` na resposta da API: `PREVIEW` (só em `dryRun`, não persistido), `PROCESSED`, `FAILED`, `UNDONE`.

### Integrações
Nenhuma externa. `TextDecoder('windows-1252')` é suportado no runtime Node da Vercel.

### Segurança
- Arquivo só em memória (RN-01); `password` (usado na F4-02) nunca logado nem persistido.
- Descrição e valores nunca em log; erros devolvem códigos, não conteúdo da linha.
- Validar `accountId` do usuário antes de qualquer parse (evita processar arquivo à toa e vazamento entre usuários).
- Sanitizar descrição: remover caracteres de controle, limitar 200 caracteres.

## Plano de implementação
- [ ] 1. Ler `prisma/schema.prisma` (2.0), use-cases de `src/server/modules/ledger/application/` (F1-01) e `src/lib/money.ts`; anotar divergências em "Registro de execução".
- [ ] 2. Criar `domain/types.ts` e `domain/import-hash.ts` (`normalizeForHash`, `buildImportHash`, `assignOccurrences`) com testes golden primeiro.
- [ ] 3. Criar `domain/parsers/ofx.ts` (SGML + XML) e fixtures sintéticos em `tests/fixtures/imports/` (ver Estratégia de testes).
- [ ] 4. Criar `domain/csv-mapping.ts` + `domain/parsers/csv.ts` (leitor RFC 4180, detecção de delimitador, heurística de `suggestedMapping`).
- [ ] 5. Criar `domain/detect-format.ts` e `parsers/registry.ts`.
- [ ] 6. Criar `domain/normalize-rows.ts` (meio-dia UTC, sinais, truncar descrição, ignorar zero).
- [ ] 7. Pedir ao `dados-prisma` a migration (modelos acima) e rodar `npx prisma generate`.
- [ ] 8. Implementar repositórios e `application/` (`import-file`, `dedupe`, `commit-import` com `$transaction`, `undo-import`, `enricher` com gancho da F2-02).
- [ ] 9. Criar Zod em `http/schemas.ts` e os Route Handlers (finos), com guard de sessão, rate limit e limite de 4 MB.
- [ ] 10. Teste de integração do fluxo completo com Prisma (banco de teste/transação revertida, como o padrão da F0-07) e teste anti-escrita em disco (CA-08).
- [ ] 11. Documentar o contrato em `docs/integrations/importacao.md` (frontmatter `estado`/`ultima-revisao`) e atualizar `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários (`*.test.ts` ao lado do código):
  - `import-hash.test.ts`: `normalizeForHash("Uber *Trip São Paulo")` = `UBER TRIP SAO PAULO`; descrição com `:` não quebra o formato; descrição > 40 caracteres truncada; golden `acc_01:2026-09-12:-4290:UBER TRIP:1`; ocorrências 1, 2, 3 para três linhas iguais; linhas iguais em datas diferentes reiniciam a ocorrência.
  - `ofx.test.ts`: SGML sem tags de fechamento; XML; `TRNAMT` com `,`; `DTPOSTED` com hora e offset (`20260912120000[-3:BRT]`) vira 2026-09-12; `MEMO` ausente usa `NAME`; charset 1252 com acento (`AÇÃO`); `STMTTRN` sem `FITID`.
  - `csv.test.ts`: delimitador `;`; valor `1.234,56`; `-42,90`; `R$ 42,90`; aspas com delimitador dentro; BOM UTF-8; linha em branco final; débito/crédito em colunas separadas; `invertSign` para extratos que listam gasto positivo; data inválida vira `error` sem derrubar o lote.
  - `detect-format.test.ts`: OFX SGML, OFX XML, CSV, PDF (bytes `%PDF`), binário aleatório → `FORMAT_NOT_RECOGNIZED`.
- [ ] Integração: fluxo completo com dedupe (CA-01 a CA-03, CA-07, CA-10); lote com 1 linha inválida em 10; todas inválidas → `FAILED` sem transações; usuário B não consegue usar `accountId` do usuário A.
- [ ] E2E: n/a (a tela vem na F4-06). Teste de rota com `Request` real e `FormData` (arquivo de 4 MB + 1 byte → 413).
- [ ] Manual: importar, com dados sintéticos, o mesmo arquivo duas vezes pela API e conferir contagens e que `private/` não é tocado.

Fixtures sintéticos (criar; valores redondos e fictícios): `tests/fixtures/imports/ofx-sgml-conta.ofx`, `ofx-xml-conta.ofx`, `ofx-sgml-cartao.ofx`, `csv-ponto-e-virgula-ptbr.csv`, `csv-debito-credito.csv`, `csv-virgula-en.csv`. Exemplo do corpo SGML (a replicar nos fixtures): `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912120000<TRNAMT>-42.90<FITID>0001<MEMO>UBER TRIP</STMTTRN>`.

## Riscos e rollback
- **Mudança futura em `normalizeForHash`** quebra dedupe retroativo. Mitigação: golden tests e comentário `NÃO ALTERAR` na função.
- **Limite de 4,5 MB da Vercel**: PDFs/CSVs de extratos pessoais ficam muito abaixo, mas o erro `413` precisa ser claro na UI.
- **Layouts de OFX divergentes** entre bancos (ex.: sinal invertido em cartão): coberto por `invertSign` apenas no CSV; para OFX de cartão, tratar no parser conforme o tipo `CCSTMTRS` e documentar como divergência se aparecer.
- **Corrida entre duas importações** do mesmo arquivo: coberta por índice único + `skipDuplicates`.
- Rollback: `POST /api/imports/[id]/undo` por lote; revert da migration (tabelas novas, sem dados de outras features). Reverter o commit remove o módulo sem afetar ledger.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
