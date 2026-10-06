# Dados

Schema, entidades, propriedade e classificação de dados do 2.0. O schema real fica em `prisma/schema.prisma` e `prisma/migrations/`; esta pasta é documentação de apoio. Convenção de frontmatter em [`../README.md`](../README.md).

## Documentos

- [`modelo-fc2.md`](modelo-fc2.md) — modelo de dados planejado do 2.0: entidades, enums, relações, índices e invariantes, com diagrama ER

## Regras

- Schema escrito do zero; o banco Neon atual pode ser apagado (ADR-016).
- Centavos inteiros (`Int`/`BigInt`), datas de calendário ao meio-dia UTC (ADR-002).
- Toda tabela financeira tem `userId`; toda query filtra por ele.
- Dados reais nunca entram no Git; fixtures só sintéticas em `tests/fixtures/`.

## Legado 1.x (referência)

- [`data-dictionary.md`](data-dictionary.md) — dicionário de dados do 1.x

## Planejados do 2.0 (nascem sob demanda)

- `ownership.md` — qual módulo é dono de cada tabela (F0-02)
- `retencao.md` — retenção de `AgentRun`, `AiUsage` e lotes de importação (F5)
- `categorias-padrao.md` — categorias BR e natureza Must/Need/Want (F1-07)
