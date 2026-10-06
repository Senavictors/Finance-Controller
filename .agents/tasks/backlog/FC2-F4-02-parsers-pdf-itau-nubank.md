---
id: FC2-F4-02
title: Parsers PDF Itaú/Nubank (extrato e fatura)
status: backlog
type: feature
phase: F4
wave: 2
owner: ia-integracoes
depends_on: [FC2-F4-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [imports, cards]
related_use_cases: []
related_adrs: [ADR-023, ADR-002, ADR-008, ADR-028]
---

# FC2-F4-02 — Parsers PDF Itaú/Nubank (extrato e fatura)

## Contexto
Os bancos do dono (Itaú e Nubank) só entregam extrato e fatura em **PDF** com texto selecionável (não é imagem). A F4-01 criou o pipeline e o contrato `ImportParser`; esta task implementa quatro parsers que transformam o texto do PDF em `ParsedRow[]` e metadados de fatura: `PDF_ITAU_EXTRATO`, `PDF_ITAU_FATURA`, `PDF_NUBANK_EXTRATO`, `PDF_NUBANK_FATURA`.

Constituição: **nenhum PDF real e nenhum texto extraído de PDF real entra no Git.** Os fixtures são 100% sintéticos e imitam apenas o layout textual. PDFs reais ficam em `private/` (gitignored) e só servem para calibrar localmente.

## Problema
Sem parsers PDF o usuário não consegue importar as fontes que realmente tem. Layouts de PDF mudam sem aviso; um parser frágil que descarta linhas em silêncio produz saldo errado, o que fere o princípio "número que não mente".

## Objetivo
1. Camada de extração de texto de PDF em memória, compatível com Vercel (runtime Node, sem binários nativos), com suporte a PDF protegido por senha informada pelo usuário no upload.
2. Quatro parsers puros (operam sobre linhas de texto) com **validações de totais** que acusam linha perdida ou lida errado.
3. Fixtures sintéticos e documentação do formato esperado.

## Fora de escopo
- OCR de PDF escaneado (imagem). Detectar e responder `PDF_NO_TEXT_LAYER`.
- Mercado Pago, outros bancos, extrato PJ em layout diferente do Nubank PF (se for igual, funciona; se não, vira task própria).
- Criar a fatura/compras no domínio de cartões a partir de `statement` (F4-04 e F1-03 cuidam do vínculo; aqui só se entrega o dado estruturado, ver RN-12).
- Regras de categorização (F4-03).

## Comportamento atual
Após a F4-01, `imports/domain/parsers/registry.ts` conhece só OFX e CSV; um PDF devolve `422 FORMAT_NOT_RECOGNIZED`. O contrato (`ImportParser`, `ParseResult`, `ParsedRowHints`, `ParsedStatementMeta`) está em `src/server/modules/imports/domain/types.ts`.

## Comportamento esperado
Upload de PDF em `POST /api/imports` (mesma rota) → extração de linhas → detecção do emissor/tipo → parser → `ParseResult`. Resposta inclui `kind` detectado. Senha: campo opcional `password` no multipart; se o PDF exigir e faltar/errar, `422 PDF_PASSWORD_REQUIRED` ou `PDF_PASSWORD_INVALID`.

### Escolha da biblioteca de extração (avaliar e registrar a decisão)
| Critério | `unpdf` | `pdfjs-dist` |
|---|---|---|
| Runtime Vercel (Node, sem canvas) | feito para serverless/edge (build do PDF.js embutido) | funciona, mas exige build `legacy`, configuração do worker e ajustes de bundling no Next |
| Dependência nativa | nenhuma | nenhuma (sem `canvas` se só extrair texto) |
| Acesso a posições (x, y) dos itens | via `getDocumentProxy` + `page.getTextContent()` | direto |
| Senha | `getDocumentProxy(data, { password })` | `getDocument({ data, password })` |
| Manutenção/tamanho | pacote fino sobre PDF.js | pacote oficial, maior |

Recomendação inicial: **`unpdf`** (`getDocumentProxy` + `getTextContent`, não só `extractText`, porque precisamos de coordenadas para reconstruir linhas). Antes de fechar: (a) instalar, (b) rodar um teste em `next build` + `next start` com Route Handler `runtime = 'nodejs'`, (c) se houver problema de bundling no Next 16, tentar `serverExternalPackages: ['unpdf']` em `next.config.ts`, (d) cair para `pdfjs-dist/legacy/build/pdf.mjs` somente se `unpdf` falhar. Registrar a decisão em `.agents/decisions/` como ADR curto ou em "Decisões" desta task (se ficar só nela, citar ADR-023).

### Extração de linhas (`infra/pdf-text.ts`)
`extractPdfLines(buffer, password?) → PdfLine[]` onde `PdfLine = { page: number; text: string }`. Algoritmo: para cada página, `getTextContent()`; agrupar itens por coordenada Y (tolerância 2 unidades), ordenar por X dentro da linha, juntar com 1 espaço (2 espaços se o intervalo horizontal > 12 unidades, preservando "colunas"), ordenar páginas e linhas de cima para baixo (Y decrescente). Sem camada de texto (nenhum item em todas as páginas) → `PDF_NO_TEXT_LAYER`. Os parsers recebem `string[]` (linhas já limpas), por isso são testáveis sem PDF.

### Contrato dos parsers (`domain/parsers/pdf/*.ts`)
```ts
export interface PdfStatementParser {
  kind: Extract<ImportKind, `PDF_${string}`>
  detect(lines: string[]): number           // 0..1, por assinaturas de texto do emissor/tipo
  parse(lines: string[], ctx: { now: Date }): ParseResult
}
```
Registrar os quatro em `registry.ts`; o `detect` do PDF usa o conjunto de linhas e escolhe o de maior confiança (mínimo 0.6; empate → `FORMAT_NOT_RECOGNIZED`).

### Formatos esperados (imitação sintética; documentar em `docs/integrations/importacao-pdf.md`)

**1. Itaú — extrato de conta** (`PDF_ITAU_EXTRATO`). Assinatura: linhas com "extrato" + "lançamentos" + "saldo (R$)". Linhas de dado:
```text
data lançamentos ag./origem valor (R$) saldo (R$)
01/09/2026 SALDO ANTERIOR 1.000,00
02/09/2026 PIX TRANSF PESSOA TESTE02/09 -150,00
02/09/2026 SALDO DO DIA 850,00
03/09/2026 PIX QRS MERCADO EXEMPLO03/09 -42,90
03/09/2026 DA EMPRESA EXEMPLO -89,90
04/09/2026 JUROS LIMITE DA CONTA -12,34
04/09/2026 IOF -1,23
05/09/2026 SISPAG EMPRESA EXEMPLO 2.000,00
05/09/2026 FATURA PAGA ITAU -300,00
```
Regex da linha: `^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}))?$`; se houver dois números no fim, o último é saldo. Regras de reconhecimento (descrição → `hints`):

| Descrição começa com | `hints.kind` | Observação |
|---|---|---|
| `SALDO DO DIA`, `SALDO ANTERIOR`, `SALDO FINAL` | (não vira linha) | usado só como checkpoint de saldo (ver validação) |
| `JUROS LIMITE` | `INTEREST` | juros do cheque especial; `categoryHint: 'Juros e encargos'` |
| `IOF` | `FEE` | `categoryHint: 'Impostos e taxas'` |
| `SEGURO CREDITO` | `FEE` | seguro atrelado ao limite |
| `DA ` + empresa | `EXPENSE` | débito automático; `merchantRaw` = empresa; candidato a recorrência |
| `PIX TRANSF ` + nome + `DD/MM` | `EXPENSE` se negativo, `INCOME` se positivo; `counterpartyType: 'PERSON'` | remover sufixo `DD/MM` da descrição; **nome da pessoa não sai do módulo** (ver F5-02, redaction) |
| `PIX QRS ` + comerciante + `DD/MM` | `EXPENSE` (negativo) / `INCOME` | `counterpartyType: 'COMPANY'`; `merchantRaw` = comerciante |
| `PAY ` + comerciante | `EXPENSE` | compra via pagamento digital |
| `FATURA PAGA` | `CARD_PAYMENT` | casa com fatura na F4-04 |
| `SISPAG ` | `INCOME` se positivo, senão `EXPENSE` | pagamento via sistema (salário/fornecedor); `merchantRaw` = restante |

Validação: para cada `SALDO DO DIA`, `saldoAnterior + Σ(valores do dia) == saldoDoDia`. Divergência → warning `BALANCE_MISMATCH` com a data (sem valores no log) e `rows` mantidas.

**2. Itaú — fatura de cartão** (`PDF_ITAU_FATURA`). Assinatura: "fatura", "resumo da fatura", "vencimento", "encargos". Seções, em ordem:
```text
Resumo da fatura
Total desta fatura R$ 1.000,00
Vencimento 15/10/2026
Fechamento 08/10/2026
Pagamento mínimo R$ 150,00
Limite total R$ 3.000,00   Limite disponível R$ 2.000,00
Pagamentos efetuados
10/09 PAGAMENTO EFETUADO -500,00
Lançamentos: compras e saques
12/09 MERCADO EXEMPLO 03/10 120,00
ALIMENTACAO .SAO PAULO
15/09 LOJA EXEMPLO 50,00
VESTUARIO .CAMPINAS
Lançamentos internacionais
18/09 SERVICO EXEMPLO USD 10,00 cotação 5,00 50,00
IOF internacional 1,75
Lançamentos: produtos e serviços
20/09 SEGURO EXEMPLO 02/12 19,90
Encargos financeiros
JUROS DE MORA 3,00
Compras parceladas - próximas faturas
```
Regras: linha de compra `DD/MM DESCRICAO [NN/NN] VALOR`; a **linha seguinte**, se casar `^[A-Z ]+ \.[A-Z ]+$`, é `CATEGORIA .CIDADE` e vira `hints.categoryHint` e `hints.city`; `NN/NN` vira `hints.installment`; internacionais: capturar `USD`/moeda, cotação e valor em R$, e a linha `IOF internacional` vira linha própria `FEE` com `marker: 'INTERNATIONAL'`; "produtos e serviços" (anuidade, seguro, parcelamento de fatura) com parcela `NN/NN`; "Encargos financeiros" cada linha vira `INTEREST`/`FEE`; "Pagamentos efetuados" viram linhas **positivas** (crédito na fatura) com `kind: 'CARD_PAYMENT'`; a seção "próximas faturas" é **ignorada** (informativa) mas contada em `warnings` como `FUTURE_SECTION_IGNORED` (info). O ano das linhas `DD/MM` vem do `Fechamento` (mês > mês do fechamento → ano anterior). Compras são **negativas** em `amountCents` (despesa), consistente com a F4-01. `statement` é preenchido: `closingDate`, `dueDate`, `totalCents`, `minPaymentCents`, `creditLimitCents`, `availableLimitCents`.
Validação: `Σ(compras + internacionais + IOF + produtos + encargos) − Σ(pagamentos) == totalCents` (ajuste por saldo anterior se a seção "saldo da fatura anterior" existir). Divergência → warning `TOTAL_MISMATCH`.

**3. Nubank — extrato de conta** (`PDF_NUBANK_EXTRATO`). Assinatura: "Extrato", "Total de entradas", "Total de saídas". Blocos por dia:
```text
02 SET 2026 Total de entradas + 1.000,00
Total de saídas - 200,00
Transferência recebida pelo Pix PESSOA TESTE - •••.000.000-•• - BANCO TESTE (0001) Agência: 1 Conta: 00000-0 1.000,00
Compra no débito MERCADO EXEMPLO 42,90
Transferência enviada pelo Pix PESSOA TESTE - •••.000.000-•• - BANCO TESTE (0001) Agência: 1 Conta: 00000-0 100,00
Pagamento de fatura 57,10
03 SET 2026 Total de entradas + 300,00
Valor adicionado para Pix no Crédito 300,00
Resgate de empréstimo 500,00
```
O valor aparece sem sinal; o **sinal vem da descrição** (tabela abaixo) e é conferido pelos totais do dia.

| Descrição começa com | Sinal | `hints` |
|---|---|---|
| `Transferência recebida` (Pix) | + | `INCOME`, `counterpartyType: 'PERSON'` ou `COMPANY` (CPF mascarado `•••` ⇒ PERSON; CNPJ ⇒ COMPANY) |
| `Transferência enviada` (Pix) | − | `EXPENSE`, idem |
| `Compra no débito` | − | `EXPENSE`, `merchantRaw` |
| `Pagamento de fatura` | − | `CARD_PAYMENT` |
| `Pagamento de boleto` | − | `EXPENSE` |
| `Valor adicionado para Pix no Crédito` | + | `marker: 'PIX_CREDIT'` (vira dívida na F4-04/F1-05; não é renda) |
| `Resgate de empréstimo` | + | `marker: 'DEBT_DISBURSEMENT'` (não é renda) |
| `Estorno` | + | `INCOME`, `categoryHint: 'Estornos'` |
Descrição guardada = texto até o primeiro ` - •••` (corta CPF mascarado, banco, agência e conta; **nunca** guardar agência/conta/CPF). Validação: `Σ entradas do dia == Total de entradas` e `Σ saídas == Total de saídas`; divergência → `DAY_TOTAL_MISMATCH`. Meses abreviados pt: JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ.

**4. Nubank — fatura de cartão** (`PDF_NUBANK_FATURA`). Assinatura: "Fatura", "Data de vencimento", "Total a pagar".
```text
Fatura fechada Período vigente: 08 SET a 07 OUT
Data de vencimento: 15 OUT 2026
Total a pagar R$ 1.000,00
Limite total R$ 2.000,00 Limite disponível R$ 1.000,00
TRANSAÇÕES
08 SET •••• 0000 Mercado Exemplo R$ 42,90
12 SET •••• 0000 Loja Exemplo - Parcela 1/2 R$ 100,00
15 SET Pagamento em 15 SET -R$ 300,00
20 SET IOF de Pix no Crédito R$ 1,00
20 SET Juros de Pix no Crédito R$ 5,00
```
Regras: `•••• 0000` (final do cartão) é descartado (nunca armazenado); `Parcela N/M` → `hints.installment`; `Juros ... Pix no Crédito` → `INTEREST` e `IOF ... Pix no Crédito` → `FEE`, ambos `marker: 'PIX_CREDIT'`; `Pagamento em` → positivo, `CARD_PAYMENT`; ano inferido de `Data de vencimento`; `statement.periodStart/End` do "Período vigente". Validação: soma = `Total a pagar` (mesma regra do Itaú).

## Regras de negócio
- RN-01: Parsers de PDF são **funções puras sobre `string[]`**; só `infra/pdf-text.ts` toca a biblioteca de PDF.
- RN-02: **Nenhuma linha é descartada em silêncio.** Linha não reconhecida dentro de uma seção de lançamentos incrementa `unparsedLines` e gera warning `UNPARSED_LINE` com o número da linha (não o conteúdo). Se `unparsedLines / linhasDeLancamento > 5%`, o lote termina com warning `LOW_PARSE_CONFIDENCE` e o resumo da F4-06 destaca.
- RN-03: Valores sempre em centavos inteiros; converter `1.234,56` → `123456` sem `parseFloat` (reaproveitar `parseMoneyToCents`); sinal conforme as tabelas acima.
- RN-04: Datas ao meio-dia UTC (ADR-002). Linha com data inválida (ex.: `31/02`) → `error`, não derruba o lote.
- RN-05: **Dados sensíveis não saem do parser:** CPF (mascarado ou não), agência, número de conta, final do cartão, chave Pix e e-mail são removidos da `description`. Nome de pessoa em Pix permanece na descrição bruta (o usuário precisa reconhecer o lançamento) mas é marcado `counterpartyType: 'PERSON'` para a redaction da F5-02 e nunca vai para log.
- RN-06: PDF protegido: `password` só em memória, nunca em log nem em `ImportBatch`.
- RN-07: Compra parcelada em fatura: cada linha da fatura é **uma parcela** (já cobrada); a F4-04/F1-03 decide vincular à compra parcelada. O parser só preenche `hints.installment`.
- RN-08: `statement` é obrigatório nas faturas; faltar `dueDate` ou `closingDate` é `PDF_LAYOUT_UNRECOGNIZED` (erro, lote não grava).
- RN-09: Linhas de fatura entram com `accountId` = **conta do cartão** escolhida no upload (o tipo da conta precisa ser `CREDIT_CARD`; senão `422 ACCOUNT_KIND_MISMATCH`). Extrato exige conta não-cartão.
- RN-10: Linhas de IOF/juros/encargos de fatura preservam `hints.kind = FEE|INTEREST` para os relatórios de "juros pagos" (F6-03).
- RN-11: A mesma fatura importada duas vezes deve deduplicar totalmente (hash da F4-01). Linha idêntica repetida (duas compras iguais no mesmo dia) usa o contador de ocorrência.
- RN-12: O parser **não** cria `CreditCardStatement`; devolve `statement`. O commit (F4-01 `commit-import`) usa o use-case de compra no cartão (`src/server/modules/cards/application/create-card-purchase.ts`, F2-03/F1-03) para obter/criar a fatura pela **chave de fatura** (mês de vencimento, ADR-008) e anexar cada linha como **um lançamento na fatura** (a linha "Parcela 1/2" é a parcela já cobrada, não uma nova compra parcelada). Se o usuário já registrou a compra parcelada antes, o casamento com a `CardInstallment` existente é feito na F4-04. Se a assinatura do use-case não comportar importação, criar um adaptador em `imports/infra/` e registrar em "Divergências".

## Critérios de aceitação
- [ ] CA-01: `extractPdfLines` extrai as linhas de um PDF sintético gerado em teste (via `pdf-lib`, devDependency) na ordem e com colunas separadas por espaço.
- [ ] CA-02: PDF sem texto devolve `PDF_NO_TEXT_LAYER`; PDF criptografado sem senha devolve `PDF_PASSWORD_REQUIRED`; com senha errada, `PDF_PASSWORD_INVALID`; com senha certa extrai.
- [ ] CA-03: Parser Itaú extrato ignora `SALDO DO DIA`/`SALDO ANTERIOR` como lançamento e classifica `JUROS LIMITE`, `IOF`, `SEGURO CREDITO`, `DA EMPRESA`, `PIX TRANSF`, `PIX QRS`, `PAY`, `FATURA PAGA` e `SISPAG` conforme a tabela.
- [ ] CA-04: Parser Itaú fatura lê resumo (total, vencimento, fechamento, mínimo, limites), pagamentos, compras com categoria/cidade, internacionais com IOF, produtos/serviços com parcela e encargos; ignora "próximas faturas"; `TOTAL_MISMATCH` não dispara no fixture íntegro e dispara quando uma linha é removida.
- [ ] CA-05: Parser Nubank extrato respeita sinais por descrição, reconhece `Valor adicionado para Pix no Crédito` e `Resgate de empréstimo` com `marker`, e acusa `DAY_TOTAL_MISMATCH` quando um valor é alterado.
- [ ] CA-06: Parser Nubank fatura lê período, vencimento, total, limite, parcelas `Parcela 1/2`, juros e IOF de Pix no crédito, pagamento positivo, e descarta final do cartão.
- [ ] CA-07: Nenhuma `description` retornada contém CPF mascarado, agência, conta ou final de cartão (teste com regex nos quatro fixtures).
- [ ] CA-08: Detecção escolhe o parser certo para cada fixture e devolve `FORMAT_NOT_RECOGNIZED` para um PDF sintético qualquer (ex.: texto "lista de compras").
- [ ] CA-09: Importar a fatura sintética duas vezes via `POST /api/imports` resulta em `new = 0` na segunda.
- [ ] CA-10: A biblioteca escolhida roda em `npx next build` + execução do Route Handler local em runtime Node; decisão registrada.
- [ ] CA-11: `docs/integrations/importacao-pdf.md` documenta os quatro formatos esperados (com os exemplos sintéticos desta task) e o procedimento de calibração local com PDFs em `private/`.
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam; `git grep` por CPF/conta reais retorna nada.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/imports/infra/pdf-text.ts` (extração com `unpdf`)
- `src/server/modules/imports/domain/parsers/pdf/itau-extrato.ts`, `itau-fatura.ts`, `nubank-extrato.ts`, `nubank-fatura.ts`, `shared.ts` (regex de dinheiro/data, meses pt, sanitização de descrição)
- `src/server/modules/imports/domain/parsers/pdf/index.ts` (exporta os quatro para `registry.ts`)
- Alterar `src/server/modules/imports/application/import-file.ts` para, em PDF, chamar `extractPdfLines` e rodar `detect` entre os quatro; passar `password`.
- `src/server/modules/imports/http/schemas.ts`: aceitar `password` opcional (string ≤ 64).
- Dependências: `unpdf` (dependency), `pdf-lib` (devDependency, só para gerar PDFs sintéticos em teste).

### Frontend
Nenhum (F4-06 apresenta avisos e pede senha).

### Banco de dados
Nenhuma mudança além da F4-01. O enum `ImportKind` da F0-02 já tem os quatro valores `PDF_*`; conferir.

### Integrações
Biblioteca de PDF (`unpdf`). Sem rede.

### Segurança
PDF só em memória; senha efêmera; sanitização de CPF/agência/conta/cartão (RN-05); sem log de conteúdo; limite de 4 MB e de 30 páginas (acima: `PDF_TOO_LARGE`) para evitar consumo de CPU.

## Plano de implementação
- [ ] 1. Ler `imports/domain/types.ts`, `registry.ts`, `import-file.ts` (F4-01) e `src/lib/money.ts`.
- [ ] 2. Instalar `unpdf` e `pdf-lib` (dev); criar `infra/pdf-text.ts`; escrever o helper de teste `tests/helpers/make-pdf.ts` (gera PDF sintético a partir de `string[]`) e o teste CA-01/CA-02.
- [ ] 3. Criar fixtures de linhas em `tests/fixtures/imports/pdf/` (arquivos `.lines.txt`, um por tipo, usando os exemplos sintéticos acima com valores fictícios redondos): `itau-extrato.lines.txt`, `itau-fatura.lines.txt`, `nubank-extrato.lines.txt`, `nubank-fatura.lines.txt`, mais uma variante `*.mismatch.lines.txt` para cada validação de total.
- [ ] 4. Implementar `shared.ts` e, um a um, os quatro parsers com TDD (teste do fixture primeiro).
- [ ] 5. Registrar em `registry.ts`; ajustar `import-file.ts` (detecção, senha, validação de tipo de conta).
- [ ] 6. Teste de integração: PDF sintético gerado em memória → `POST /api/imports` → transações NEEDS_REVIEW; repetir → duplicadas.
- [ ] 7. Validar em build/execução (CA-10) e registrar a escolha de biblioteca.
- [ ] 8. Escrever `docs/integrations/importacao-pdf.md`; atualizar `docs/README.md` e `.agents/context/CONTEXT.md`.
- [ ] 9. Calibração local (não versionada): o dono roda os parsers contra PDFs em `private/`; ajustes de regex voltam como correção dos fixtures sintéticos, nunca como PDF/texto real.

## Estratégia de testes
- [ ] Unitários: um arquivo `*.test.ts` por parser, lendo o fixture. Casos concretos:
  - Itaú extrato: linha com 2 números (valor + saldo) vs 1 número; `PIX TRANSF PESSOA TESTE02/09` sem espaço antes da data; valor `-1.234,56`; dia sem lançamentos; descrição com `SALDO DO DIA` no meio de outra palavra não é ignorada indevidamente (match só no início); sinal positivo em `SISPAG`.
  - Itaú fatura: virada de ano (fechamento 08/01, compra 28/12 → ano anterior); compra sem linha de categoria; internacional com cotação decimal `5,25`; parcela `12/12`; "próximas faturas" ignorada; total divergente.
  - Nubank extrato: dia sem "Total de entradas"; Pix de empresa (CNPJ) vs pessoa (CPF mascarado); descrição curta sem ` - •••`; estorno; mês `FEV`; total divergente.
  - Nubank fatura: virada de ano no período; parcela `3/10`; pagamento em data anterior ao período; juros e IOF de Pix no crédito.
  - Edge: linha com espaços duplos/tabulação; caracteres `•` e `–` Unicode; descrição > 200 caracteres truncada; PDF vazio de lançamentos (`rows = []` com warning `NO_ROWS`).
- [ ] Integração: PDF sintético → API → Inbox; `PDF_PASSWORD_REQUIRED` com PDF cifrado gerado por `pdf-lib`/`qpdf` em teste (se a lib não suportar cifrar, testar com mock da camada de extração).
- [ ] E2E: n/a.
- [ ] Manual: calibração local com PDFs reais em `private/` (fora do Git), conferindo `warnings` vazios e totais batendo.

## Riscos e rollback
- **Layout real diferente do sintético** (principal risco). Mitigação: validações de total/saldo, `UNPARSED_LINE`, `LOW_PARSE_CONFIDENCE`, calibração local; parsers tolerantes a espaços e à ordem das colunas.
- **Biblioteca de PDF não roda na Vercel**: fallback documentado (`pdfjs-dist/legacy`); último recurso: converter localmente e importar CSV/OFX.
- **PDF protegido por senha**: coberto por `password` efêmera; a UI avisa.
- **Custo de CPU** em PDFs grandes: limite de 30 páginas e 4 MB, `maxDuration = 30`.
- Rollback: remover as quatro entradas do `registry.ts` volta o comportamento da F4-01 (PDF → `FORMAT_NOT_RECOGNIZED`); nenhuma migration destrutiva.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
