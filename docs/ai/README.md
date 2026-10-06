---
estado: planejado
fonte: docs/product/especificacao-fc2.md
ultima-revisao: bootstrap-init 2026-10-05
---

# IA no Finance Controller 2.0

Decisões: ADR-024 (parser e categorização em camadas), ADR-025 (camada única de tools), ADR-026 (OpenAI com orçamento fixo, redaction e registro de custo), ADR-027 (bot Telegram). Contratos dos prompts: [`prompts.md`](prompts.md). Ameaças e dados sensíveis: [`../security/README.md`](../security/README.md).

## Princípio

IA é o último degrau, não o primeiro. Regras e código determinístico resolvem o que podem; o modelo entra só onde ganha tempo de digitação. IA nunca move dinheiro, nunca confirma lançamento sozinha acima do limiar de confiança configurado e sempre deixa o usuário sobrescrever (o override do usuário vence, ADR-024).

## Escopo das funcionalidades

| Funcionalidade | Camada | Usa LLM? | Fase |
|---|---|---|---|
| Parser quick-add | parser determinístico pt-BR | não | F2 |
| Fallback do parser | LLM só quando o determinístico não fecha o rascunho | sim | F5 |
| Categorização | 1) override do usuário e regras, 2) memória de merchant, 3) LLM few-shot | só na camada 3 | F4/F5 |
| Resumo semanal | agente agendado (Vercel Cron) lê dados agregados | sim | F5 |
| Vigia | agente que detecta anomalias (valor fora do padrão, assinatura nova, duplicidade) | parcialmente (regras primeiro, LLM para texto) | F5 |
| Chat no Telegram | consulta e captura via tools | sim | F5 |
| Transcrição de áudio | nota de voz do Telegram vira texto | sim | F5 |
| MCP | Claude/ChatGPT consultam dados (somente leitura por padrão) | externo | F5 |

Fora de escopo: recomendação de investimentos, decisões automáticas de pagamento, treino de modelo com dados do usuário.

## Orçamento

- Crédito total da OpenAI: **US$ 5** (limite duro do projeto). Meta de uso: até US$ 1 por mês.
- **Teto mensal configurável** (padrão US$ 1). Atingido o teto, a IA desliga e o app continua funcionando com regras e parser; o usuário é avisado uma vez.
- Cada chamada grava um registro em `AiUsage`: modelo, finalidade, tokens de entrada e saída, custo estimado e data. O painel em Mais mostra gasto do mês e restante do crédito.
- Alerta em 50% e 80% do teto mensal; corte automático em 100%.
- Antes de cada chamada, o cliente estima custo e recusa se ultrapassar o teto restante (falha fechada).
- Limites de taxa: no máximo N chamadas por minuto e por dia por finalidade, para conter loops e abuso do bot.
- Cache por hash do prompt para categorização repetida de um mesmo merchant.

## Modelos

| Uso | Modelo (família) | Motivo |
|---|---|---|
| Fallback do parser, categorização | gpt-5-nano | barato, saída curta e estruturada |
| Resumo semanal, chat, vigia (texto) | gpt-5-mini | melhor redação, ainda barato |
| Transcrição de áudio | modelo de transcrição da OpenAI | custo por minuto, notas curtas |

Os identificadores exatos ficam em configuração (variável de ambiente e `src/server/modules/ai/`), não espalhados no código. Trocar modelo não exige mudar contratos. Usar saída estruturada (JSON com schema Zod) em todo prompt que alimenta código.

## Redaction (o que nunca enviar)

Antes de qualquer envio, um redator em `src/server/modules/ai/` remove ou substitui:

- CPF, CNPJ, RG e qualquer documento;
- números de conta, agência, cartão (inteiro ou parcial além dos 4 últimos dígitos) e chaves Pix;
- nomes de terceiros, e-mails e telefones (trocados por tokens como `PESSOA_1`);
- endereços;
- saldos totais, valores de salário e limite de contas; para o resumo, enviar variações e proporções agregadas em vez de saldos absolutos quando possível;
- arquivos de extrato ou fatura inteiros: **nunca** vão ao LLM; o parse é determinístico e em memória;
- segredos, tokens e variáveis de ambiente.

Para categorização, envia-se apenas a descrição normalizada do merchant e, no máximo, valor arredondado e dia da semana. O teste do redator é obrigatório (Vitest, fixtures sintéticas) e roda no CI; um vazamento é bug bloqueante.

Dados enviados à API não devem ser usados para treino: configurar a conta/projeto conforme a política vigente do provedor e registrar a configuração em `.agents/context/CONTEXT.md`.

## Avaliação

### Conjunto de teste de categorização

- Local: `tests/fixtures/categorizacao/` (versionado), com **dados sintéticos** descrevendo merchants e descrições brutas no estilo bancário brasileiro, sem nenhuma transação real.
- Tamanho inicial: 200 exemplos rotulados à mão, cobrindo todas as categorias padrão, com casos difíceis (descrição truncada, nome de pessoa jurídica obscuro, Pix, estabelecimento com várias naturezas, USD).
- Um conjunto de validação real, derivado do uso do dono, fica em `private/` (gitignored) e é medido localmente; só as métricas agregadas podem ser registradas em docs, nunca os dados.

### Métricas

| Métrica | Definição | Meta |
|---|---|---|
| Acurácia top-1 | categoria sugerida igual ao rótulo | pelo menos 85% no conjunto sintético; 80% das transações finais sem edição manual (spec) |
| Acurácia top-2 | rótulo entre as duas sugestões da Inbox | pelo menos 95% |
| Precisão em auto-confirmação | acertos entre as transações confirmadas sem revisão (acima do limiar) | pelo menos 97% |
| Cobertura | fração categorizada sem pedir revisão | pelo menos 80% |
| Taxa de override | fração das sugestões corrigidas pelo usuário | acompanhar; subir indica regressão |
| Custo por mil categorizações | de `AiUsage` | dentro do teto mensal |
| Matriz de confusão | pares de categorias mais trocados | revisar a cada mudança de prompt |

Processo: todo ajuste de prompt, modelo ou few-shot roda a avaliação (`npm test` com o conjunto sintético, mocks de LLM para CI e uma execução opcional contra a API real sob demanda). Resultado entra no PR da task. Regressão de acurácia acima de 2 pontos bloqueia a mudança. O limiar de auto-confirmação é calibrado com a precisão medida e começa conservador (confirmação manual na Inbox).

## Limites e guardrails

- Toda saída do modelo é validada por Zod; saída inválida é descartada e o fluxo cai para a Inbox (falha segura).
- O modelo só enxerga tools do registro (ADR-025) e de leitura por padrão; escrita exige confirmação do usuário no Telegram ou na UI.
- Sem texto livre do modelo executando ações: ele propõe um `Draft` ou uma chamada de tool tipada.
- Conteúdo vindo de fora (descrição de extrato, mensagem recebida) é dado, nunca instrução: o prompt delimita e o código ignora comandos embutidos.
- Resumo e vigia usam apenas dados agregados do ciclo; não recebem texto bruto de extratos.
- Modo degradado: sem IA, tudo funciona; a IA só reduz digitação.
- Auditoria: `AgentRun` guarda finalidade, tools chamadas e resultado, sem payload sensível.
