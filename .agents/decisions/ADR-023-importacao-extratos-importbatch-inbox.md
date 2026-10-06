---
id: ADR-023
title: Importação de extratos (PDF/OFX/CSV) com ImportBatch, importHash e Inbox
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F4-01, FC2-F4-02, FC2-F4-04, FC2-F4-05, FC2-F4-06, FC2-F7-01]
supersedes: []
---

# ADR-023 — Importação de extratos (PDF/OFX/CSV) com ImportBatch, importHash e Inbox

## Contexto
O 1.x não tinha importação: tudo era digitado. O dono usa Itaú e Nubank (PDF de extrato e de fatura) e Mercado Pago; OFX/CSV só quando o banco oferece. A meta é fechar o mês importando em cerca de 10 minutos (spec §10, F4). Extratos contêm dados sensíveis (CPF, número de conta, nomes de terceiros), e o repositório é público: nada disso pode ir para o Git nem persistir sem necessidade. Vercel limita o corpo de requisição de funções a 4,5 MB.

## Decisão
1. **Formatos** (`ImportBatch.kind`): `OFX`, `CSV`, `PDF_ITAU_EXTRATO`, `PDF_ITAU_FATURA`, `PDF_NUBANK_EXTRATO`, `PDF_NUBANK_FATURA`. Parsers em `src/server/modules/imports/domain/parsers/PDF_ITAU_EXTRATO.ts (um arquivo por kind)`, funções puras `(buffer|texto) -> ParsedRow[]`.
2. **Processamento em memória**: o arquivo é enviado ao route handler, processado em memória (`pdfjs-dist`/`unpdf` para texto; OFX por parser SGML tolerante; CSV por mapeamento de colunas) e **descartado**. O arquivo original **não é persistido** (nem em disco, nem em Blob, nem no banco). Persistem apenas as linhas normalizadas e o `importHash`. Limite de upload: **4 MB** por arquivo (abaixo do teto de 4,5 MB da Vercel) e 1 arquivo por requisição; PDFs maiores devem ser divididos ou convertidos para CSV.
3. **Linha normalizada** (`ParsedRow`): `date` (meio-dia UTC), `amountCents` (com sinal), `rawDescription`, `externalId?` (FITID do OFX), `kind` sugerido, `installment?` (n/N) e, para fatura, `statementKey`.
4. **Idempotência**: `importHash = sha256(userId | accountId | yyyy-mm-dd | amountCents | descNormalizada | ocorrência)`, em que `descNormalizada` é minúscula, sem acento e sem espaços repetidos, e `ocorrência` é o índice (0, 1...) entre linhas idênticas no mesmo arquivo (duas compras iguais no mesmo dia continuam distintas). `Transaction.importHash` tem índice único `(userId, importHash)`; reimportar o mesmo arquivo ou arquivos sobrepostos não cria duplicatas (`ON CONFLICT DO NOTHING`, contagem de ignoradas no batch). Se existir `externalId`, ele entra no hash no lugar de `ocorrência`.
5. **`ImportBatch`**: `id`, `userId`, `accountId`, `kind`, `status` (PARSING | READY | COMMITTED | FAILED), `rowsTotal`, `rowsNew`, `rowsDuplicate`, `rowsMatched`, `periodStart`, `periodEnd`, `createdAt`, `errorMessage?`. Nenhum nome de arquivo do usuário é gravado (somente o `kind`).
6. **Fluxo**: upload > parse > pré-visualização (contagens e amostra) > commit. As linhas novas entram como `Transaction` com `source = IMPORT`, `status = CLEARED` (extrato) ou ligadas a `CreditCardStatement` (fatura), `review = NEEDS_REVIEW`. Antes do commit passam pelo matching com PLANNED (ADR-020) e pelo pareamento de transferências entre contas próprias (F4-04). A categorização segue o ADR-024.
7. **Inbox** (`Lançamentos > Inbox`): fila de `review = NEEDS_REVIEW`, em pilha de cartões com swipe (direita confirma, esquerda adia), top-2 sugestões de categoria com explicação e "criar regra" com preview retroativo. Itens com confiança >= 0,85 (ADR-024) entram já `REVIEWED`, mas aparecem em "automáticos" para auditoria.
8. **Reconciliação pós-importação**: ao importar extrato, o sistema compara o saldo final do extrato (quando presente) com o ledger e propõe reconciliação (ADR-019).
9. **Open Finance adiado** (Pluggy, F7-01): custo mensal por conexão e dependência de credenciais; avaliar quando a importação manual deixar de ser suficiente.

## Alternativas consideradas
### Alternativa A — Open Finance (Pluggy ou similar) desde o início
- Vantagens: zero upload manual; dados mais limpos.
- Desvantagens: custo recorrente e dependência de terceiro, credenciais bancárias sob guarda de um provedor, cobertura irregular por instituição; desproporcional para uso pessoal.

### Alternativa B — Persistir o PDF original (Blob) para reprocessar
- Vantagens: permite reparse quando o parser melhora.
- Desvantagens: guarda dado sensível sem necessidade; custo de armazenamento; risco de vazamento. Reprocessar exige reenviar o arquivo, aceitável.

### Alternativa C — Somente LLM para ler PDFs
- Vantagens: tolera mudanças de layout.
- Desvantagens: custo contra o teto de US$ 5, risco de enviar dados sensíveis, não determinístico (ver ADR-024 e ADR-026).

## Consequências
### Positivas
- Fechamento do mês em minutos; reimportação segura.
- Mínimo de dado sensível persistido.

### Negativas
- Parsers de PDF quebram quando o banco muda o layout; manutenção contínua.
- Limite de 4 MB exige arquivos por período.

### Riscos
- Fatura com parcelas e estornos mal interpretados: testes com fixtures sintéticas que reproduzem a estrutura, nunca arquivos reais (que ficam em `private/`, gitignored).
- Colisão de `importHash` entre lançamentos legítimos distintos: coberta pelo índice de ocorrência.

## Plano de adoção
1. FC2-F4-01: pipeline, `ImportBatch`, `importHash`, OFX e CSV.
2. FC2-F4-02: PDFs Itaú e Nubank (extrato e fatura) com fixtures sintéticas em `tests/fixtures/imports/`.
3. FC2-F4-04, F4-05, F4-06: matching, Inbox e tela Importar.

## Validação
- Importar duas vezes o mesmo arquivo sintético: 0 novas na segunda vez.
- Meta de campo: fechar um mês em ~10 min; >= 80% das linhas sem edição manual (spec §11).
- Nenhum arquivo ou texto bruto de extrato em logs (revisão do `qa-revisor`).

## Revisão
Quando um banco mudar o layout de forma que quebre um parser, ou ao decidir Open Finance (F7-01).
