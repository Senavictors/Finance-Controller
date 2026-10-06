# Diagramas

Diagramas em Mermaid (texto versionável). Cada arquivo traz cabeçalho com propósito, `status` e `fonte`.

## Índice

| Arquivo | Tipo | Status | Fonte |
|---|---|---|---|
| [`fluxo-captura.md`](fluxo-captura.md) | flowchart + sequência | rascunho | especificação §4.3, ADR-024 |
| [`fluxo-importacao.md`](fluxo-importacao.md) | flowchart + sequência | rascunho | especificação §4.2, ADR-023 |
| [`fluxo-disponivel.md`](fluxo-disponivel.md) | flowchart | rascunho | especificação §5.1, ADR-021 |

Diagramas estruturais ficam embutidos nos documentos de [`../architecture/`](../architecture/README.md) (containers, dependências) e de [`../data/modelo-fc2.md`](../data/modelo-fc2.md) (ER).

## Legado 1.x (referência)

Fluxos e sequências do 1.x: [`../architecture/flows.md`](../architecture/flows.md) e [`../architecture/sequence.md`](../architecture/sequence.md).

## Planejados do 2.0 (nascem sob demanda)

- `fluxo-recorrencia.md` — materialização e matching (F3-01)
- `fluxo-fatura.md` — compra, ciclo, pagamento (F1-03)
- `fluxo-telegram.md` — mensagem, tool, resposta (F5-04)

## Governança

Status `canônico`, `rascunho` ou `desatualizado`; `fonte` aponta o código ou doc conferido. Ao implementar o fluxo, a task revisa o diagrama e muda o status.
