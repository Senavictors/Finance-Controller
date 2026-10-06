---
id: ADR-017
title: Arquitetura de informação mobile-first com 4 abas e captura global
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F0-05, FC2-F2-04, FC2-F2-05, FC2-F3-04, FC2-F3-05, FC2-F3-06]
supersedes: [ADR-005]
---

# ADR-017 — Arquitetura de informação mobile-first com 4 abas e captura global

## Contexto
No 1.x a home era um dashboard customizável por drag-and-drop (ADR-005) e o botão de novo lançamento existia só em `/transactions`. Resultado: abrir o app não respondia "quanto posso gastar" e lançar exigia navegar até uma tela específica. A spec define os princípios "resposta em 2 s" e "capturar em 5 s" (§3). O dispositivo principal é o iPhone 13 Pro (390×844, PWA instalada), usado com uma mão; desktop é secundário.

## Decisão
1. **Quatro abas fixas** na TabBar de vidro (altura `--fc-tabbar-h`, 68 px): **Hoje**, **Lançamentos** (Todos | Inbox), **Planejar** e **Cartões**. Mais um quinto destino **Mais** acessado pelo avatar/ícone no cabeçalho de Hoje (não ocupa slot da TabBar): relatórios, contas, categorias, regras, importar, integrações, conta. Os cinco destinos correspondem às rotas `src/app/(app)/{hoje,lancamentos,planejar,cartoes,mais}`.
2. **Captura global**: FAB central "+" sobreposto à TabBar, visível em todas as telas; abre a sheet de captura (campo único, parser determinístico, ADR-024). Atalhos no desktop: `/` e `Cmd/Ctrl+K`. O bot Telegram (ADR-027) é a terceira porta de entrada e usa o mesmo use-case.
3. **Hoje é a home opinativa** (rota `/` redireciona para `/hoje`): hero com aura, modo Normal ou Aperto (ADR-021), ritual de 30 s, "vence em breve". O dashboard drag-and-drop **deixa de ser home**; seus widgets úteis viram relatórios opcionais em `Mais > Relatórios` (F6-03). O layout de widgets arrastáveis é removido.
4. **Limites de navegação**: no máximo 2 níveis de profundidade a partir de uma aba (aba → tela → sheet). Sheets e toasts nunca empilham mais de 2.
5. Layout: coluna única de largura máxima 430 px centralizada; em viewport >= 1024 px, rail lateral com as mesmas 4 abas e conteúdo expandido em duas colunas. Respeitar `env(safe-area-inset-*)` (notch e home indicator).

## Alternativas consideradas
### Alternativa A — Manter dashboard drag-and-drop como home (ADR-005)
- Vantagens: já existe e funciona; flexível.
- Desvantagens: exige configuração antes de gerar valor; no iPhone o arrastar compete com o scroll; não garante que "livre para gastar" apareça acima da dobra; custo de manutenção de persistência de layout para um único usuário.

### Alternativa B — Navegação lateral/hambúrguer com 8+ módulos
- Vantagens: tudo acessível a um toque no desktop.
- Desvantagens: foge do padrão iOS; alcance do polegar ruim; mistura rotina diária (Hoje, Lançamentos) com administração (regras, categorias).

### Alternativa C — 5 abas com "Mais" como quinta aba
- Vantagens: padrão iOS clássico.
- Desvantagens: FAB central e 5 slots apertam a barra em 390 px (alvos < 44 px, `--fc-touch-min`); "Mais" é de uso raro e desperdiça o slot.

## Consequências
### Positivas
- Valor em 2 s: o primeiro render é o número que importa.
- Hábito diário concentrado em duas abas (Hoje + Lançamentos/Inbox).
- Um único ponto de captura reduz o caminho a 1 toque + digitação.

### Negativas
- Perde-se a personalização livre de widgets.
- Hoje fica dependente da engine Disponível (F3-02); antes dela, mostra placeholders honestos.

### Riscos
- FAB sobre conteúdo cobrindo ações: reservar `padding-bottom: calc(var(--fc-tabbar-h) + env(safe-area-inset-bottom))` em todas as telas.
- Telas "Mais" virarem gaveta de bagunça: regra de revisão que toda nova tela precisa de dono entre as 4 abas ou justificativa.

## Plano de adoção
1. FC2-F0-05: shell com 5 destinos vazios, TabBar, FAB e PWA (manifest, ícones, `apple-touch-icon`, `viewport-fit=cover`).
2. FC2-F2-04 (sheet), F2-05 (Lançamentos), F3-06 (Cartões), F3-05 (Planejar), F3-04 (Hoje).
3. Remover rotas e componentes do dashboard drag-and-drop na F0-01; reintroduzir seus gráficos apenas em F6-03.

## Validação
- Teste manual no iPhone 13 Pro instalado: abrir o app mostra o hero de Hoje em < 2 s em 4G (medir no Lighthouse/Web Vitals, LCP < 2,0 s).
- Captura: mediana < 5 s do toque no FAB ao salvar (métrica spec §11).
- Todos os alvos de toque >= 44 px.

## Revisão
Reavaliar após 4 semanas de uso real (F6) ou se "Mais" ultrapassar 8 itens.
