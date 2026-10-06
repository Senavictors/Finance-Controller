---
id: FC2-F6-04
title: Acessibilidade, auditoria visual e checagem PWA (contraste, VoiceOver, alvos de toque, Lighthouse)
status: backlog
type: chore
phase: F6
wave: 2
owner: qa-revisor
depends_on: [FC2-F6-01, FC2-F6-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [styles, components-fc, app-shell, pwa, tests]
related_use_cases: []
related_adrs: [ADR-017, ADR-018]
---

# FC2-F6-04 — Acessibilidade, auditoria visual e checagem PWA

## Contexto
Critério de saída da F6 (spec §10): "Lighthouse PWA ok; 5/7 dias de uso". Esta task é a verificação final de qualidade: contraste dos tokens dark glass (ADR-018), uso com VoiceOver no iPhone, alvos de toque de no mínimo 44 px (`--fc-touch-min`) e instalabilidade como PWA. O papel `qa-revisor` tem veto sobre concluir tasks sem evidência; aqui ele produz as evidências e corrige o que for de baixo risco (valores de token e atributos ARIA), encaminhando o restante.

## Problema
O design é dark glass com texto translúcido sobre vidro e sobre a aura animada: o risco de contraste insuficiente é alto e nunca foi medido. Também não houve passada com leitor de tela, nem varredura de alvos de toque, nem checagem formal de PWA. Observação importante: o Lighthouse 12 (maio de 2024) removeu a categoria "PWA" do relatório; o critério "Lighthouse PWA ok" precisa ser traduzido em verificações concretas de instalabilidade (abaixo). O 1.x não tem nada equivalente (não era PWA).

## Objetivo
1. Auditoria automatizada de contraste dos tokens, com teste que falha em regressão.
2. Passada de VoiceOver no iOS nas telas principais, com checklist e correções.
3. Varredura de alvos de toque (menores que 44 px) com relatório e correções.
4. Checagem de PWA: manifest, ícones, meta tags do iOS, instalação, comportamento em modo standalone, mais Lighthouse (Performance, Acessibilidade, Boas práticas) em modo mobile.
5. Auditoria visual: uso exclusivo de tokens `--fc-*` e Constituição (sem dado real).
6. Relatório consolidado em `docs/ui/auditoria-f6.md`.

## Fora de escopo
- Reescrever componentes inteiros (defeitos grandes viram tasks no backlog com evidência).
- Funcionalidades novas (push, offline completo, sincronização).
- Localização além de pt-BR.
- Testes de dispositivos que não sejam o iPhone 13 Pro e o desktop Chrome/Safari.

## Comportamento atual
- `src/styles/tokens.css` define as cores; nenhum teste de contraste existe. Valores a conferir primeiro: `--fc-text-3: rgba(222, 230, 255, 0.42)` (texto terciário e legendas de 11 a 13 px) e texto pequeno diretamente sobre as manchas da aura (`--fc-calm-1`, `--fc-tense-1`, `--fc-hot-1`). Um cálculo manual aproximado sugere cerca de 3,5:1 para `--fc-text-3` sobre `--fc-ink` e cerca de 4,0:1 para o texto principal sobre a mancha mais clara da aura calma; são hipóteses a confirmar com o script, não conclusões.
- PWA: o shell e o manifest foram feitos na FC2-F0-05; não há verificação formal.
- No 1.x: não há PWA nem auditoria; nada a reaproveitar.

## Comportamento esperado

### 1. Contraste dos tokens (automatizado)
`scripts/audit-contrast.ts` (executável por `npm run audit:contrast`, chamado também por um teste Vitest `src/styles/tokens-contrast.test.ts`):
- Lê `src/styles/tokens.css` (parser simples de `--fc-*: valor`), converte hex e `rgba()`, compõe cores com alfa sobre a pilha de fundos (composição em sRGB como o navegador: `result = fg * a + bg * (1 - a)`), calcula luminância relativa WCAG 2.x e a razão de contraste.
- Pares verificados (primeiro plano sobre fundo):
  - Texto: `--fc-text`, `--fc-text-2`, `--fc-text-3` sobre `--fc-ink`, `--fc-ink-raised`, `--fc-void`, e sobre vidro composto (`--fc-glass` e `--fc-glass-strong` sobre `--fc-ink`; `--fc-glass-bar` e `--fc-glass-sheet` sobre `--fc-ink`).
  - Texto sobre acento: `--fc-text-on-accent` sobre `--fc-iris`, `--fc-iris-lo`, `--fc-iris-hi`.
  - Acento como texto/ícone: `--fc-iris`, `--fc-iris-hi` sobre `--fc-ink` e sobre o vidro.
  - Semântica: `--fc-in`, `--fc-out`, `--fc-pend`, `--fc-info`, `--fc-debt` sobre `--fc-ink` e sobre o vidro.
  - Aura: `--fc-text` sobre cada mancha das três auras (`--fc-calm-1..3`, `--fc-tense-1..3`, `--fc-hot-1..3`) compostas sobre `--fc-ink`, no pior caso (mancha mais clara).
  - Categóricas: `--fc-cat-1..10` sobre `--fc-ink` (objetos gráficos).
- Limiares (WCAG 2.2): texto normal (menos de 18,66 px em negrito ou 24 px) 4,5:1; texto grande 3:1; componentes de interface e objetos gráficos 3:1 (critério 1.4.11). Cada par é classificado com o tamanho de uso real (por exemplo, `--fc-text-caption` é 11 px, portanto normal).
- Saída: tabela `docs/ui/contraste-tokens.md` (par, razão, limiar, resultado) gerada pelo script. O teste falha se algum par obrigatório cair abaixo do limiar.
- Política de correção (autorizada à QA apenas para valores de contraste): ajustar o alfa/cor do token mínimo necessário (por exemplo, subir o alfa de `--fc-text-3` até passar) e registrar a mudança como emenda ao ADR-018; se o texto pequeno sobre a aura falhar, preferir colocar o texto sobre um chip de vidro (`--fc-glass-strong`) em vez de escurecer a aura (mudança de componente vai para a task do componente, com evidência).

### 2. VoiceOver (manual no iPhone 13 Pro)
Roteiro `docs/ui/roteiro-voiceover.md`, executado em Ajustes > Acessibilidade > VoiceOver, com o app instalado como PWA:
- Estrutura: `<main>`, `<nav aria-label="Principal">` na TabBar, hierarquia de títulos (h1 por tela, h2 por seção) para o rotor de Títulos; ordem de leitura = ordem visual; nenhum item decorativo lido (`aria-hidden` na aura, ornamentos e ícones redundantes).
- TabBar: cada aba com nome e `aria-current="page"` na ativa; FAB com rótulo "Novo lançamento" e papel de botão.
- Sheet de captura: `role="dialog"`, `aria-modal="true"`, título associado, foco movido ao campo ao abrir, foco preso e devolvido ao FAB ao fechar; chips com rótulos completos ("Categoria: Transporte, tocar para alterar"); mensagens de erro e de fatura de destino em região `aria-live="polite"`.
- Valores: lidos de forma compreensível (`R$ 42,90` lê "quarenta e dois reais e noventa centavos" no VoiceOver em português; verificar); com privacidade ligada, lê "valor oculto".
- Gráficos: `role="img"` com resumo textual e tabela equivalente acessível (Hoje: caixa e ritmo; Relatórios).
- Toast com Desfazer: `role="status"`; como a janela de 6 s da F2-04 pode ser curta para quem usa leitor de tela (WCAG 2.2.1 Timing Adjustable), estender para 10 s e pausar enquanto o foco estiver no toast, e garantir um caminho alternativo de desfazer na lista de Lançamentos.
- Carrossel de cartões e de "Vence em breve": navegável por ordem sequencial, com posição lida ("2 de 4").
- Anel do ritual e sequência: texto alternativo ("Ritual: 1 de 2 passos concluídos").
- Zoom: o `viewport` não pode desativar o zoom (`user-scalable=no`/`maximum-scale=1` proibidos); verificar pinça no Safari e texto legível a 200% sem perda de função.
- Movimento reduzido: com Ajustes > Reduzir Movimento ligado, o app não anima (CA da F6-01).
- Registrar cada falha com tela, passo, esperado e obtido; corrigir as de atributo/rótulo na hora; defeitos estruturais viram tasks.

### 3. Alvos de toque
- Dev: `src/lib/dev/touch-audit.ts` (carregado só com `?audit=touch`): percorre `button, a[href], [role="button"], [role="tab"], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])`, mede `getBoundingClientRect()` e lista os menores que 44 x 44 px (`--fc-touch-min`), com seletor e tela; desconsidera links dentro de parágrafos de texto (isenção do critério 2.5.8) e elementos ocultos.
- Se a FC2-F0-07 incluiu Playwright, o mesmo script roda em 390 x 844 nas 6 telas como teste (`tests/a11y/touch-targets.spec.ts`), falhando com a lista de violações.
- Correção: aumentar a área clicável por padding ou pseudo-elemento sem mudar o visual; contagem final de violações deve ser zero.

### 4. Checagem de PWA
- Manifest (`src/app/manifest.ts` ou `public/manifest.webmanifest`): `name`, `short_name`, `start_url` (`/hoje`), `scope`, `display: standalone`, `orientation: portrait`, `theme_color` e `background_color` coerentes com `--fc-void`/`--fc-ink`, ícones 192 e 512 (incluindo `purpose: maskable`), `lang: pt-BR`.
- iOS: `<link rel="apple-touch-icon">` 180 x 180, `apple-mobile-web-app-capable`/`mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`), imagens de abertura (`apple-touch-startup-image`) para 1170 x 2532 (iPhone 13 Pro), `viewport-fit=cover` e uso de `env(safe-area-inset-*)` (topo com notch e base com a barra de início).
- Service worker, se existir (shell offline mínimo): registro correto, página de fallback offline, nenhuma resposta de dados financeiros em cache compartilhado (apenas assets estáticos e o shell); sem service worker, registrar a decisão.
- HTTPS (Vercel), cabeçalhos seguros e sem conteúdo misto.
- Instalação real: Safari > Compartilhar > Adicionar à Tela de Início; abrir em modo standalone; conferir ícone, nome, tela de abertura, barra de status, teclado e sheet (`visualViewport`), rolagem sem elástico indesejado, retorno do segundo plano e sessão mantida (login longo da FC2-F0-06).
- Lighthouse (Chrome, modo mobile, build de produção em uma URL de preview da Vercel com dados de teste): categorias Desempenho, Acessibilidade, Boas práticas e SEO; metas: Acessibilidade maior ou igual a 95, Boas práticas maior ou igual a 95, Desempenho maior ou igual a 85 (LCP menor que 2,5 s e CLS menor que 0,1 na Hoje). Se a versão usada for anterior à 12 e ainda trouxer a categoria PWA, anexar também esse resultado. Relatórios HTML guardados em `private/` ou apenas resumidos (sem dados reais) em `docs/ui/auditoria-f6.md`.

### 5. Auditoria visual e Constituição
- `scripts/check-token-usage.mjs` (`npm run lint:tokens`): falha se encontrar cor literal (`#hex`, `rgb(`, `rgba(`, `hsl(`, nomes de cor CSS), `box-shadow` ou `border-radius` com valor literal em `src/components` e `src/app` (exceto `tokens.css`). Adicionar ao CI (`.github/workflows/ci.yml`).
- Varredura anti-dado-real: padrões de CPF/CNPJ (`\d{3}\.\d{3}\.\d{3}-\d{2}`), sequências de 11 ou mais dígitos, e-mails que não sejam de exemplo, nomes de arquivos de extrato, qualquer caminho em `private/`, em `src/`, `docs/`, `.agents/`, `tests/fixtures/` (complementa `bootstrap-audit`).
- Matriz visual manual (iPhone 13 Pro): 6 telas (Hoje, Lançamentos, Captura, Planejar, Cartões, Relatórios) x 3 estados (normal, vazio, erro) x modos (calm/tense/hot na Hoje; privacidade ligada/desligada). Capturas de tela guardadas fora do Git (`private/`), com as conclusões em `docs/ui/auditoria-f6.md`.

## Regras de negócio
- RN-01: razões de contraste seguem WCAG 2.2: 4,5:1 (texto normal), 3:1 (texto grande e componentes/gráficos).
- RN-02: alvo de toque mínimo de 44 x 44 px (`--fc-touch-min`) para todo controle interativo (exceto link em texto corrido).
- RN-03: nenhuma informação transmitida só por cor (gráficos têm rótulo e tabela; estados de dívida/atraso têm texto).
- RN-04: a QA só altera valores de token por razão de contraste e registra a emenda ao ADR-018; mudanças de comportamento viram tasks.
- RN-05: nenhum dado financeiro real entra no relatório, nas capturas versionadas nem nos relatórios do Lighthouse (Constituição).
- RN-06: o "Lighthouse PWA ok" da spec é satisfeito pela combinação de instalabilidade verificada (itens acima) e Lighthouse nas categorias vigentes; a divergência (categoria PWA removida no Lighthouse 12) é registrada em "Divergências".
- RN-07: a task só conclui com evidência anexa (relatórios, tabelas, capturas resumidas) de cada critério.

## Critérios de aceitação
- [ ] CA-01: `npm run audit:contrast` roda, gera `docs/ui/contraste-tokens.md` e todos os pares obrigatórios atendem aos limiares (ou ajuste documentado em emenda ao ADR-018).
- [ ] CA-02: o teste `src/styles/tokens-contrast.test.ts` passa e falha ao reduzir o alfa de `--fc-text-3` abaixo do limiar (verificado uma vez de forma manual).
- [ ] CA-03: texto de 11 a 15 px sobre a aura nos 3 estados atinge 4,5:1 (por chip de vidro ou ajuste de token); o número do hero (texto grande) atinge 3:1.
- [ ] CA-04: roteiro de VoiceOver executado nas 6 telas; falhas de rótulo/ordem/foco corrigidas; `docs/ui/roteiro-voiceover.md` com resultado por item.
- [ ] CA-05: o toast de Desfazer dura pelo menos 10 s com pausa por foco, e há alternativa de desfazer na lista.
- [ ] CA-06: o `viewport` permite zoom e o texto continua utilizável a 200%.
- [ ] CA-07: auditoria de alvos de toque com zero violações nas 6 telas (390 x 844).
- [ ] CA-08: manifest e meta tags do iOS completos; app instala e abre em standalone no iPhone 13 Pro com ícone, nome e tela de abertura corretos; safe areas respeitadas.
- [ ] CA-09: Lighthouse mobile em build de produção: Acessibilidade maior ou igual a 95, Boas práticas maior ou igual a 95, Desempenho maior ou igual a 85; LCP menor que 2,5 s e CLS menor que 0,1 na Hoje.
- [ ] CA-10: `npm run lint:tokens` passa e está no CI; zero cores/sombras/raios literais.
- [ ] CA-11: varredura anti-dado-real sem ocorrências.
- [ ] CA-12: `docs/ui/auditoria-f6.md` consolida resultados, correções feitas e defeitos encaminhados (cada um com task criada no backlog).
- [ ] CA-13: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Nenhum.
### Frontend
- `scripts/audit-contrast.ts`, `scripts/check-token-usage.mjs`, `src/styles/tokens-contrast.test.ts`, `src/lib/dev/touch-audit.ts`, `package.json` (scripts `audit:contrast`, `lint:tokens`), `.github/workflows/ci.yml` (passo de tokens).
- Correções pontuais: `src/styles/tokens.css` (apenas contraste, com emenda ao ADR-018), atributos ARIA e rótulos em `src/components/fc/**`, áreas de toque, `src/app/layout.tsx` (viewport e meta iOS), manifest e ícones em `public/`, duração e pausa do toast (`src/components/fc/toast/undo-toast.tsx`).
### Banco de dados
Nenhum.
### Integrações
Lighthouse (CLI ou DevTools). Nenhuma integração de runtime.
### Segurança
Nenhum dado real nos artefatos; relatórios com dados reais ficam em `private/` (gitignored).

## Plano de implementação
- [ ] Etapa 1: `scripts/audit-contrast.ts` e teste; rodar e listar falhas.
- [ ] Etapa 2: corrigir tokens/componentes (política de correção) e registrar a emenda ao ADR-018; regenerar `docs/ui/contraste-tokens.md`.
- [ ] Etapa 3: `touch-audit.ts` (e Playwright, se existir); corrigir violações.
- [ ] Etapa 4: `check-token-usage.mjs`, `lint:tokens` e CI.
- [ ] Etapa 5: roteiro de VoiceOver e execução no iPhone; corrigir rótulos/foco/ordem; ajustar o toast.
- [ ] Etapa 6: revisão de manifest, meta tags, ícones e imagens de abertura; testar instalação.
- [ ] Etapa 7: Lighthouse (mobile, produção) e correções de baixo risco; registrar o que ficou.
- [ ] Etapa 8: varredura anti-dado-real e matriz visual manual.
- [ ] Etapa 9: `docs/ui/auditoria-f6.md`, tasks de backlog para os defeitos remanescentes, `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários, funções do auditor de contraste (valores de referência conhecidos): preto sobre branco = 21:1; branco sobre branco = 1:1; `#777777` sobre `#ffffff` = aproximadamente 4,48:1 (falha para texto normal); `#767676` sobre branco = aproximadamente 4,54:1 (passa); composição `rgba(255,255,255,0.5)` sobre preto = cinza `#808080` aproximado; parser lê `--fc-*` hex e `rgba()` do `tokens.css` e ignora comentários.
- [ ] Unitários/regressão: o teste de tokens roda sobre o `tokens.css` real e falha por par abaixo do limiar; o resultado esperado após a correção é todos os pares obrigatórios aprovados.
- [ ] Unitários, `check-token-usage`: arquivos de amostra com `#fff`, `rgb(0,0,0)`, `box-shadow: 0 0 4px #000` e `border-radius: 12px` literais são detectados; `var(--fc-*)` não; `tokens.css` é ignorado.
- [ ] Integração: `touch-audit` em jsdom com elementos de tamanho simulado (limitado, pois jsdom não faz layout); validação real no navegador via Playwright ou manual.
- [ ] E2E (opcional, Playwright): 6 telas em 390 x 844 sem violações de toque; axe-core (`@axe-core/playwright`) sem violações sérias ou críticas nas 6 telas, se a dependência for aprovada.
- [ ] Manual: roteiro de VoiceOver (6 telas); instalação PWA; Lighthouse; matriz visual; teste de zoom; Reduzir Movimento.

Edge cases: texto sobre aura em transição de estado (cross-fade em andamento: usar o pior caso entre os estados); vidro sobre aura (fundo mais claro que `--fc-ink`: calcular sobre a mancha); modo privacidade (rótulo "valor oculto" lido uma vez, não por caractere); teclado aberto com sheet (alvos de toque e foco visíveis); orientação paisagem bloqueada pelo manifest; aparelho com Pouca Energia.

## Riscos e rollback
- Risco: corrigir contraste alterar a identidade visual. Mitigação: ajuste mínimo por par, aprovação do dono do produto para qualquer mudança perceptível, emenda ao ADR-018.
- Risco: VoiceOver revelar falhas estruturais. Mitigação: corrigir o que for rótulo/atributo; abrir tasks com evidência para o resto, sem bloquear a F6 além dos itens críticos.
- Risco: metas de Lighthouse inatingíveis por causa de blur e vidro. Mitigação: priorizar LCP e CLS da Hoje, adiar o resto com justificativa.
- Rollback: mudanças em tokens e atributos são pequenas e isoladas; reverter o commit restaura o estado anterior; scripts de auditoria são independentes do runtime.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.
