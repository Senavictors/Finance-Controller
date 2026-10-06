---
estado: planejado
fonte: docs/product/especificacao-fc2.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Visão 2.0

Substitui a visão do FC 1.x, que declarava Open Finance e IA fora de escopo e posicionava o projeto como portfólio e SaaS. Essas premissas não valem mais (ADR-016).

## Problema

O dono parou de usar o FC 1.x porque o sistema cobra mais esforço do que devolve:

- lançar um gasto custa dois campos de digitação e vários toques, e só é possível numa tela;
- o saldo não bate com o do banco, então o número não inspira confiança;
- o app não responde "quanto posso gastar hoje";
- recorrências dependem de ação manual e importar extratos não existe.

Sem hábito de registro, os dados ficam incompletos e o sistema perde valor. A causa raiz é fricção de captura somada a números que não merecem confiança.

## Objetivos

1. Responder "quanto posso gastar" em até 2 segundos após abrir o app.
2. Capturar um gasto em até 5 segundos, por texto livre, sheet global ou bot Telegram.
3. Fazer o saldo do ledger igualar o saldo do banco, com reconciliação explícita.
4. Tornar o futuro dado: recorrências, parcelas, faturas e renda viram lançamentos previstos que casam com os reais.
5. Fechar o mês importando extratos em cerca de 10 minutos, com revisão por Inbox.
6. Modelar o perfil financeiro real: cheque especial em uso, vários cartões, dívidas com juros, renda MEI.
7. Usar IA com orçamento fixo para reduzir digitação, nunca para tomar decisão financeira.

## Não-objetivos

- Produto multiusuário, SaaS, demo pública ou landing de portfólio. O `userId` permanece nas tabelas apenas por segurança.
- Multi-tenant, planos, cobrança ou onboarding para terceiros.
- Aconselhamento de investimentos, recomendação de produtos financeiros ou score de crédito.
- Execução de pagamentos ou movimentação de dinheiro. O app lê, registra e projeta.
- Aplicativo nativo iOS. O produto é PWA.
- Integração com WhatsApp (o canal é Telegram).
- Open Finance na entrega inicial: fica na F7, depende de custo e credenciais próprias.
- Dark patterns de engajamento. O hábito vem de um ritual curto, não de pressão.

## Persona única

O dono do produto: pessoa física, uso pessoal, iPhone 13 Pro como dispositivo principal, desktop como apoio. Perfil financeiro (sem valores):

- conta corrente com cheque especial usado com frequência, saldo negativo é cenário normal;
- vários cartões com ciclos e limites diferentes, incluindo uso de Pix no crédito;
- empréstimos consignados em sistema Price, às vezes com parcelas em atraso;
- renda como MEI: pagamento mensal em dia fixo, base mais adicional por dia presencial, conta PJ separada, DAS mensal e teto anual a acompanhar;
- contas fixas em débito automático, assinaturas (algumas em USD) e boletos.

## Métricas

| Métrica | Meta | Como medir |
|---|---|---|
| Captura | mediana abaixo de 5 s do gesto ao salvar | instrumentação do sheet de captura |
| Reconciliação | diferença de R$ 0,00 por conta no fechamento | tabela `Reconciliation` |
| Automação | pelo menos 80% das transações sem edição manual | `categorySource` e `review` por transação |
| Hábito | app aberto em 5 de 7 dias | sequência semanal do ritual |
| Custo de IA | até US$ 1 por mês, teto total de US$ 5 | `AiUsage` |
| Tempo de fechamento | cerca de 10 min por mês | cronometragem do fluxo de importação |

Métricas são pessoais e locais: nada é enviado a terceiros.
