# Teste de Sanidade — Finance Controller 2.0

Este arquivo tem duas seções com propósitos diferentes. Não misture o conteúdo delas — um `bootstrap-audit` futuro precisa poder checar as duas separadamente.

## Constituição do projeto

Princípios inegociáveis, declarados pelo dono na inicialização (`bootstrap-init`, 2026-10-05). Qualquer proposta de mudança que contradiga um item aqui deve ser sinalizada explicitamente antes de prosseguir — não corrigida ou ignorada silenciosamente.

- **Dados reais fora do Git.** Extratos, faturas, CPF, números de conta e cartão, saldos, salário, contratos de empréstimo e nomes de terceiros nunca entram no repositório (código, seeds, fixtures, migrations, docs, tasks, handoffs, ADRs, commits). Fixtures usam apenas dados sintéticos; arquivos reais ficam em `private/` (gitignored) e só são lidos para calibração local.
- **Design system único.** Toda a interface usa exclusivamente os tokens `--fc-*` de `src/styles/tokens.css` e os primitivos de `src/components/fc/` — nenhuma cor, raio, sombra ou duração literal em componentes. Esta regra substitui a convenção antiga "NO purple / tema Apex" do 1.x (ADR-018).

_Atualize esta seção quando o dono declarar uma nova restrição inegociável — não adicione itens aqui por conta própria; isso é decisão do dono, registrada aqui como referência rápida (o detalhe completo, se houver, vive em `.agents/decisions/`)._

## Perguntas de sanidade

Perguntas específicas deste projeto que o agente deve responder corretamente, mentalmente, antes de começar a codificar uma task nova.

1. Em qual camada pode existir acesso ao Prisma, e por que um `route.ts` ou um componente não pode conter regra de negócio? (Resposta: só em `infra/`; Route Handlers/Actions só validam e chamam use-cases, que também servem bot e MCP — ADR-025.)
2. Como se calcula o saldo de uma conta e quando um saldo negativo é válido? (Resposta: soma do ledger, com `AccountBalance` só como cache atualizado na mesma transação; negativo é válido até o limite do cheque especial — ADR-019.)
3. Que operação exige confirmação humana na hora, mesmo com a autorização geral do dono para zerar o banco, e qual papel tem veto sobre ela? (Resposta: reset/migration destrutiva/`npm run build` contra o Neon de produção; veto do `dados-prisma`.)
4. O que nunca pode ser enviado à OpenAI e o que acontece quando o teto mensal estoura? (Resposta: CPF, contas, cartões, nomes de terceiros; o sistema degrada para regras e memória de merchant — ADR-026.)
5. Por que pagamento de fatura e transferência entre contas próprias não entram no orçamento Flex nem em receita/despesa? (Resposta: evitar dupla contagem; o gasto já foi contado na compra do cartão.)
6. Quem pode marcar uma task como concluída? (Resposta: só `bootstrap-complete` após parecer `APROVADO` do `qa-revisor` com evidências — ADR-031.)

`bootstrap-audit` relê esta seção como parte da checagem de sanidade.
