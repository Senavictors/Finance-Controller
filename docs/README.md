# Mapa da Documentação — Finance Controller 2.0

Pasta versionada (decisão de 05/10/2026). Nada aqui pode conter dados financeiros reais: valores são fictícios ou fórmulas (ver Constituição em `.agents/test-onboarding.md`).

## Convenção de estado (documentação viva)

Todo documento desta pasta (exceto os `README.md` de índice) começa com um frontmatter mínimo:

```yaml
---
estado: planejado | real | divergente
fonte: arquivo/pasta de código que sustenta este doc, ou a spec de origem
ultima-revisao: task ou data que atualizou este doc por último
---
```

- **planejado** — descreve algo especificado mas ainda não implementado. É o estado de quase tudo no início do 2.0.
- **real** — descreve o comportamento confirmado no código atual.
- **divergente** — documento e código discordam e a divergência ainda não foi resolvida; registre a divergência no corpo do doc, nunca corrija silenciosamente.

Quem mantém isso vivo: `bootstrap-complete` (ao concluir uma task que toca a área, atualiza o doc, carimba `ultima-revisao` e vira `planejado → real` quando aplicável) e `bootstrap-audit` (aponta docs `real` suspeitos de estarem defasados).

## Fontes primárias

Esta pasta complementa as fontes abaixo, nunca as duplica.

| Assunto | Fonte primária |
|---|---|
| Produto: problema, princípios, arquitetura de informação, engines, fórmulas, fases e métricas | [`product/especificacao-fc2.md`](product/especificacao-fc2.md) (spec mestre) |
| Decisões arquiteturais (ADR-002 a ADR-031) | `.agents/decisions/` (índice em `.agents/decisions/README.md`) |
| Estado de trabalho, tasks e handoffs | `.agents/tasks/`, `.agents/handoffs/`, `PLANS.md` |
| Contexto vivo do projeto | `.agents/context/CONTEXT.md` |
| Constituição (dados reais fora do Git, design system único) | `.agents/test-onboarding.md` |
| Documentação do FC 1.x (`.docs/`: visão, arquitetura, domínio, API, dados) | migrada para as subpastas deste mapa e reescrita para o 2.0; o que for histórico vai para [`roadmap/legado/`](roadmap/README.md#historico-1x) |
| Tokens de design | `src/styles/tokens.css` (descritos em [`ui/design-system.md`](ui/design-system.md)) |
| Todo o resto (arquitetura, domínio, módulos, API, dados, integrações, diagramas, UI, IA, segurança, roadmap) | esta pasta (`docs/`) |

Quando uma task e a spec divergirem, a task vence para o seu escopo e a spec é atualizada por `bootstrap-complete`.

## Regra de organização

Nenhum arquivo solto na raiz de `docs/` além deste `README.md` — todo doc vive numa subpasta do mapa abaixo. A documentação 1.x pré-existente em `.docs/` não é apagada silenciosamente: é migrada para as subpastas e o histórico vai para `roadmap/legado/`.

## Comece por aqui

Núcleo:

1. [Arquitetura](architecture/README.md)
2. [Domínio](domain/README.md)
3. [Módulos](modules/README.md)
4. [API](api/README.md)
5. [Dados](data/README.md)
6. [Integrações](integrations/README.md)
7. [Diagramas](diagrams/README.md)

Extensões deste projeto:

- [`product/`](product/README.md) — spec mestre, visão 2.0 e fluxos de UX
- [`ui/`](ui/README.md) — design system dark glass, catálogo de componentes e padrões de tela
- [`ai/`](ai/README.md) — escopo, orçamento, redaction, avaliação e contratos de prompts
- [`security/`](security/README.md) — threat model single-user e privacidade
- [`roadmap/`](roadmap/README.md) — fases F0 a F7 e histórico 1.x

Toda extensão nova entra declarada nesta lista — nenhuma pasta surge em `docs/` sem constar deste mapa.

## Implementar uma funcionalidade

Task (`.agents/tasks/`) → módulo (`modules/`) → API/dados (`api/`, `data/`) → UI (`ui/`) → decisões (`.agents/decisions/`) → testes

## Corrigir um bug

Task → módulo → known issues → testes → causa raiz → handoff (`.agents/handoffs/`)
