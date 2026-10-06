---
estado: planejado
fonte: docs/product/especificacao-fc2.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Fluxos de UX

Jornadas principais do dono no iPhone 13 Pro (PWA). Valores são fictícios. Telas citadas estão detalhadas em [`../ui/padroes-de-tela.md`](../ui/padroes-de-tela.md).

## 1. Abrir o app de manhã

Objetivo: saber em 2 s quanto pode gastar e o que vence.

```text
abrir PWA -> Hoje (aura calma|tensa|quente)
  -> número principal: "Livre para gastar até <fim do ciclo>" ou "Falta até o salário"
  -> R$/dia e ritmo
  -> ritual do dia (revisar inbox, registrar gastos)
  -> "Vence em breve" (carrossel)
```

- O número aparece sem toques; skeleton só no primeiro carregamento, depois dado em cache e atualização silenciosa.
- Se há itens na Inbox, o ritual mostra o contador e leva direto à pilha.
- Falha de rede: último valor em cache com selo "atualizado há N min".

## 2. Lançar um gasto no metrô

Objetivo: capturar em até 5 s, com uma mão, sem sinal bom.

1. Toca no FAB central. O sheet abre com o campo focado.
2. Digita `uber 18` (ou `ifood 42,90 nubank`). O parser pt-BR gera chips: categoria, valor, conta, data, tipo.
3. Se for cartão, o sheet mostra a fatura de destino e se o gasto impacta o caixa do ciclo ou só o flex.
4. Toca em "Salvar" (ou "Salvar e outro"). O toast confirma com "Desfazer".

Offline: o rascunho fica na fila local e sincroniza ao voltar a conexão; o toast indica "na fila". Se o parser determinístico falha, o fallback de IA é opcional e respeita o orçamento ([`../ai/README.md`](../ai/README.md)).

Alternativa: mensagem ao bot Telegram com o mesmo texto.

## 3. Revisar a Inbox

Objetivo: inbox zero em poucos minutos por semana.

```text
Lançamentos -> aba Inbox -> pilha de cartões
  swipe direita = confirmar     swipe esquerda = adiar
  toque = editar (sugestões top-2 com explicação)
  "criar regra" -> preview retroativo -> confirmar
```

- Cada cartão mostra descrição bruta, valor, sugestão de categoria com a razão ("5 vezes antes nesta loja") e, quando existir, o match com recorrência ou transferência.
- Na web, atalhos de teclado: setas, X para confirmar, R para regra.
- Ao zerar, estado vazio celebratório e discreto; sem confete obrigatório.

## 4. Fechar o mês com extratos

Objetivo: reconciliar contas em cerca de 10 min.

1. Mais, Importar: escolhe os arquivos (PDF, OFX ou CSV) no Files do iPhone.
2. O app processa em memória, cria um `ImportBatch` e mostra contagens: novas, duplicadas (`importHash`), casadas com previstas.
3. Itens novos e ambíguos vão para a Inbox; casados entram como confirmados.
4. Revisa a Inbox (fluxo 3).
5. Tela de reconciliação por conta: saldo do ledger vs saldo informado do extrato. Diferença deve ser R$ 0,00; senão, mostra ajuste sugerido (`ADJUSTMENT`) e exige confirmação.
6. Resumo do mês e arquivamento do ciclo.

Os arquivos reais ficam em `private/` (gitignored) e nunca são commitados.

## 5. Dia do salário

Objetivo: confirmar o recebimento e redistribuir o ciclo sem esforço.

- Na véspera, Hoje mostra a renda prevista do ciclo (base mais adicional pelos dias presenciais do calendário).
- No dia, o carrossel "Vence em breve" traz o cartão de renda com a ação "Confirmar recebimento".
- A confirmação casa a entrada na conta PJ com a série de renda; o app sugere a transferência PJ para PF como par ligado (ADR-004).
- O ciclo de renda vira: o Flex do novo ciclo é calculado, o modo Aperto, se ativo, é desligado e a aura volta ao estado calmo.
- O DAS do mês e o acumulado contra o teto anual do MEI aparecem em Planejar.

## 6. Cartão vencendo antes do salário

Objetivo: decidir como pagar sem estourar o cheque especial às cegas.

```text
Hoje (modo Aperto, aura quente)
  "Falta até o salário: R$ X" + lista do que vence antes
  gráfico de saldo projetado com faixa do cheque especial
    -> toque no cartão que vence -> Cartões (fatura fechada, vence em N dias)
    -> "Pagar fatura" sugere a conta de maior saldo
       aviso: "vai usar R$ Y do cheque especial" (custo mensal estimado)
    -> alternativa: ver dívidas por taxa em Planejar
```

O app informa o custo, não proíbe a escolha. Pagar a fatura cria um par `CARD_PAYMENT` ligado e atualiza o caixa projetado na hora.

## Princípios transversais

- Nenhum fluxo exige formulário longo; a edição é inline.
- Toda ação destrutiva ou em lote tem Desfazer.
- Estados vazios, de erro e offline são desenhados, não deixados em branco.
- Valores sensíveis respeitam o modo privacidade (ocultar números).
