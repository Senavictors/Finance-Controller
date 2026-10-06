---
estado: planejado
fonte: docs/product/especificacao-fc2.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Padrões de tela

Layout e hierarquia das telas do 2.0, em 390×844 com gutter de 18px. Estrutura geral: conteúdo rolável, TabBar de vidro fixa embaixo, FAB de captura central, safe areas respeitadas. As jornadas estão em [`../product/fluxos-ux.md`](../product/fluxos-ux.md); os componentes em [`componentes.md`](componentes.md). Valores abaixo são fictícios.

```text
+---------------------------+
| status bar (safe area)    |
| título / ação (Mais)      |  cabeçalho curto
|---------------------------|
| bloco 1: foco da tela     |  1 número ou 1 pergunta
| bloco 2: ação / alerta    |
| bloco 3..n: listas, cards |  rola
|---------------------------|
| TabBar + FAB (safe area)  |
+---------------------------+
```

Hierarquia comum: foco (hero ou resumo) → o que exige ação (vencimentos, inbox) → detalhe (listas, gráficos) → histórico. Seções começam por um caption em `--fc-text-caption`.

## Hoje

Home opinativa; responde "quanto posso gastar" sem toques.

1. **Hero com aura** (`Hero`, estado calmo, tenso ou quente).
   - Modo Normal: "Livre para gastar até o fim do ciclo", valor em `NumberTicker`, R$/dia, `ProgressTrack` do ritmo (marcador do dia), "limite: flex" ou "limite: caixa".
   - Modo Aperto: "Falta até o salário", valor, lista curta do que vence antes e gráfico de saldo projetado com faixa do cheque especial.
2. **Ritual de hoje**: anel de 2 passos (revisar inbox, registrar gastos) e sequência semanal.
3. **Vence em breve**: `CardCarousel`; atrasados primeiro (`--fc-pend`/`--fc-out`); renda com ação "Confirmar recebimento".
4. **Caixa no fim do ciclo**: saldo, entradas previstas, faturas, fixas/DAS/parcelas, em `GlassCard`.
5. **Contas**: `ListRow` com saldo real e uso do cheque especial.

Vazio: sem contas, o hero vira convite para criar a primeira conta. Erro: último valor em cache com selo de defasagem.

## Lançamentos e Inbox

Cabeçalho com `SegmentedControl` Todos | Inbox (badge com o contador) e busca.

- **Todos:** lista agrupada por dia (caption com data e total do dia), `ListRow` por lançamento, busca instantânea, filtros em sheet, edição inline, swipe para ações rápidas, Desfazer em toda mudança. Previstos aparecem em estilo atenuado com `StatusPill`.
- **Inbox:** pilha de `InboxCard` ocupando a área central; contador "N restantes"; botões Adiar e Confirmar abaixo da pilha (equivalentes ao swipe); "criar regra" abre sheet com preview retroativo (quantos lançamentos seriam afetados). Vazio: "Inbox zerada" com resumo do dia.

## Captura (sheet)

Aberta pelo FAB (ou `/`, ⌘K e bot). `Sheet` em detent médio que sobe com o teclado.

1. Campo único focado, com placeholder de exemplos ("uber 18 ontem").
2. Linha de `Chip`s editáveis: tipo, valor, categoria, conta, data, parcelas.
3. Para cartão: faixa informando a fatura de destino e se vence no ciclo atual (impacta o caixa) ou não (só o flex).
4. Presets de parcelas (à vista, 2, 3, 6, 10, 12×) e sugestões recentes em chips rolantes.
5. Rodapé fixo: "Salvar" (primário) e "Salvar e outro"; após salvar, `Toast` com Desfazer.

Erro de parser: o texto permanece, chips não reconhecidos ficam em `--fc-pend` pedindo ajuste; nunca perde o que foi digitado.

## Planejar

Foco: para onde vai a renda do ciclo.

1. **Renda do ciclo**: base mais adicional presencial (calculado pelo calendário) e DAS, com o acumulado contra o teto anual do MEI em `ProgressTrack`.
2. **Barra de alocação**: contas e assinaturas, parcelas de dívida, DAS, Flex e "para sair do vermelho / reserva", em segmentos coloridos pela semântica (`--fc-debt`, `--fc-info`, `--fc-in`).
3. **Dívidas e juros**: lista ordenada por taxa (rotativo, cheque especial, Pix no crédito e limite convertido, consignado) com custo mensal em R$, saldo devedor e data prevista de quitação.
4. **Flex por categoria**: `ProgressTrack` com marcador do dia por balde; watchlists.
5. **Metas**: Reserva, Prioridade, Desejo e Quitação, com progresso e prazo estimado.

## Cartões

Foco: a fatura e quando ela vence.

1. **Carrossel de cartões** (`CardCarousel`) com gradiente por emissor.
2. **Fatura atual**: aberta ou fechada, "vence em N dias", total, `ProgressTrack` do limite usado.
3. **Ações**: "Pagar fatura" sugerindo a conta de maior saldo e avisando quando usaria cheque especial.
4. **Próximas faturas**: valor por mês com a parte vinda de parcelas.
5. **Parcelas ativas**: lista com parcela atual de total e saldo restante.
6. Menu de lançamento: mover para outra fatura; estorno abatendo a fatura.

## Mais

Acessada pelo ícone no cabeçalho das telas principais (a TabBar tem quatro destinos). Lista agrupada em `GlassCard`: Relatórios, Contas, Categorias, Regras, Importar, Integrações (Telegram, MCP), Conta e segurança, Privacidade (modo ocultar valores) e Sobre. Cada item é uma `ListRow` com ícone; Importar mostra o último lote e itens pendentes.

## Estados e comportamento transversal

| Situação | Padrão |
|---|---|
| Carregando | skeleton com `--fc-glass`, sem spinner de tela inteira |
| Vazio | ícone, uma frase, uma ação |
| Erro | mensagem clara, ação "Tentar de novo", dado em cache se houver |
| Offline | selo discreto; captura continua em fila local |
| Privacidade | valores mascarados por `MoneyText` |
| Desktop | mesmo conteúdo em duas colunas a partir de 1024px; TabBar vira barra lateral; `/` e ⌘K abrem a captura |
