# UI — Design system e telas

Fonte de código: `src/styles/tokens.css` (tokens `--fc-*`) e `src/components/fc/` (primitivos). Decisão: ADR-018 (design system Dark Glass com tokens únicos) e ADR-017 (4 abas mais captura global).

| Documento | Conteúdo |
|---|---|
| [`design-system.md`](design-system.md) | Filosofia, tokens, tipografia, espaçamento, raios, vidro, cor semântica, aura, motion, acessibilidade e baseline do iPhone 13 Pro |
| [`componentes.md`](componentes.md) | Catálogo dos primitivos `src/components/fc/`: props, estados, anatomia, do e don't |
| [`padroes-de-tela.md`](padroes-de-tela.md) | Layout e hierarquia de Hoje, Lançamentos/Inbox, Captura, Planejar, Cartões e Mais |
| [`navegacao-e-pwa.md`](navegacao-e-pwa.md) | App shell, tab bar, safe areas, manifest, ícones e instalação como PWA no iPhone |

Regras que valem para todo o código de UI:

1. Nenhuma cor, raio, sombra ou duração literal em componentes: somente `var(--fc-*)`.
2. Primitivos novos nascem em `src/components/fc/` e entram no catálogo antes de serem usados em telas.
3. Mobile-first: projete em 390×844 e expanda para desktop depois.
4. Valores monetários passam sempre por `AmountText`.

Relacionados: [`../product/fluxos-ux.md`](../product/fluxos-ux.md) (jornadas), tasks FC2-F0-03, FC2-F0-04, FC2-F0-05 e FC2-F6-01 em `PLANS.md`.
