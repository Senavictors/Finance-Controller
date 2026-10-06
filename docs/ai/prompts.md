---
estado: planejado
fonte: docs/ai/README.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Contratos dos prompts

Contratos planejados (F5). Cada prompt tem entrada redigida (ver redaction em [`README.md`](README.md)), saída em JSON validada por Zod e guardrails. Os textos finais vivem em `src/server/modules/ai/prompts/`; aqui fica o contrato, não a redação completa. Valores são fictícios.

Regras comuns a todos:

- Saída exclusivamente JSON, sem texto fora do objeto. Em falha de validação: uma nova tentativa com a mensagem de erro; persistindo, descartar e cair para o fluxo sem IA.
- Conteúdo vindo de usuário ou extrato vai dentro de delimitadores e é tratado como dado.
- Temperatura baixa (0 a 0,2) para extração e classificação.
- Cada chamada registra `AiUsage` e respeita o teto mensal.
- Idioma de entrada e saída: português do Brasil.

## 1. Fallback do parser quick-add

Quando o parser determinístico (ADR-024) não produz um `Draft` completo.

Entrada:

```json
{
  "texto": "pizza com a galera 120 ontem cartao itau",
  "hoje": "2026-10-05",
  "contas": [{ "id": "a1", "apelido": "Itau corrente" }, { "id": "a2", "apelido": "Itau cartao" }],
  "categorias": [{ "id": "c1", "nome": "Restaurantes" }, { "id": "c2", "nome": "Mercado" }],
  "parcial": { "valorCentavos": 12000 }
}
```

Saída:

```json
{
  "tipo": "EXPENSE",
  "valorCentavos": 12000,
  "data": "2026-10-04",
  "descricao": "Pizza",
  "contaId": "a2",
  "categoriaId": "c1",
  "parcelas": 1,
  "tags": [],
  "confianca": 0.82,
  "duvidas": []
}
```

Guardrails:

- `valorCentavos` é inteiro em centavos; nunca decimal. Se o valor não está no texto, devolver `null` e listar em `duvidas`.
- `contaId` e `categoriaId` só podem ser ids recebidos na entrada; id inventado invalida a saída.
- Datas relativas resolvidas com `hoje`; resultado em `AAAA-MM-DD`.
- `confianca` abaixo do limiar: o rascunho abre no sheet com chips em atenção, nunca salva sozinho.
- Nunca inferir tipo `TRANSFER` sem duas contas explícitas.

## 2. Categorização few-shot

Camada 3 da categorização, usada só quando override do usuário, regras e memória de merchant não decidem.

Entrada:

```json
{
  "descricaoNormalizada": "PADARIA SAO JORGE",
  "valorAproximadoCentavos": 2500,
  "diaDaSemana": "sab",
  "categorias": [{ "id": "c2", "nome": "Mercado" }, { "id": "c1", "nome": "Restaurantes" }],
  "exemplos": [
    { "descricao": "PADARIA PAO QUENTE", "categoriaId": "c1" },
    { "descricao": "SUPERMERCADO BOM PRECO", "categoriaId": "c2" }
  ]
}
```

Saída:

```json
{
  "sugestoes": [
    { "categoriaId": "c1", "confianca": 0.74, "razao": "estabelecimento de alimentação pronta, semelhante a exemplo rotulado" },
    { "categoriaId": "c2", "confianca": 0.18, "razao": "pode ser compra de pães para casa" }
  ]
}
```

Guardrails:

- Até 2 sugestões ordenadas, `confianca` entre 0 e 1, soma não precisa ser 1.
- `razao` curta (até 120 caracteres), em português, sem dados pessoais; é exibida na Inbox.
- Exemplos few-shot vêm das correções do próprio usuário (merchants parecidos), limitados a 10, já redigidos.
- Só ids de categoria da entrada. Descrição desconhecida: devolver `sugestoes` vazio em vez de chutar.
- A auto-confirmação depende do limiar calibrado; abaixo dele a transação vai para a Inbox.
- Resultado é cacheado por descrição normalizada.

## 3. Resumo semanal

Agente agendado (Vercel Cron, ADR-030), enviado pelo Telegram. Entrada exclusivamente agregada.

Entrada:

```json
{
  "periodo": { "inicio": "2026-09-28", "fim": "2026-10-04" },
  "flex": { "gastoPercentual": 62, "ritmo": 1.08, "diasRestantes": 12 },
  "porCategoria": [{ "nome": "Restaurantes", "variacaoPercentual": 35 }],
  "venceNosProximos7Dias": [{ "titulo": "Fatura cartao", "dia": "2026-10-09", "valorCentavos": 150000 }],
  "inbox": { "pendentes": 4 },
  "modoAperto": false
}
```

Saída:

```json
{
  "titulo": "Semana de 28/09 a 04/10",
  "destaques": ["Restaurantes 35% acima da semana anterior"],
  "atencao": ["Fatura vence dia 09, valor previsto R$ 1.500,00"],
  "sugestao": "Revisar 4 itens da Inbox antes do fechamento.",
  "tom": "neutro"
}
```

Guardrails:

- Só afirma números presentes na entrada; nenhum cálculo novo nem projeção própria (cálculo é da engine).
- Máximo de 3 itens em `destaques` e 3 em `atencao`; texto curto, sem julgamento moral sobre gastos.
- Sem recomendação de investimento, empréstimo ou produto.
- Se `modoAperto` for verdadeiro, `tom` é `alerta` e `atencao` começa pelo que falta e o que vence antes.
- O texto final é montado a partir do JSON por template no código; o modelo não envia mensagem diretamente.

## 4. Vigia

Detecta anomalias. Regras determinísticas geram os candidatos (valor acima de N vezes a mediana do merchant, assinatura nova, cobrança duplicada em 48 h, parcela atrasada, aumento de preço recorrente); o LLM só redige a explicação e pode reduzir falsos positivos.

Entrada (por candidato):

```json
{
  "tipo": "VALOR_ATIPICO",
  "merchant": "STREAMING XYZ",
  "valorCentavos": 5990,
  "medianaCentavos": 3990,
  "ocorrenciasAnteriores": 8,
  "data": "2026-10-03"
}
```

Saída:

```json
{
  "relevante": true,
  "severidade": "media",
  "mensagem": "STREAMING XYZ cobrou R$ 59,90; a mediana é R$ 39,90. Pode ser reajuste.",
  "acaoSugerida": "ABRIR_LANCAMENTO"
}
```

Guardrails:

- `severidade` em `baixa | media | alta`; `acaoSugerida` em `ABRIR_LANCAMENTO | CRIAR_REGRA | IGNORAR`. Nenhuma ação executa sozinha.
- Anti-spam: no máximo 3 alertas por dia e um por candidato; severidade baixa vai só para o resumo semanal.
- `relevante: false` suprime o alerta, mas o candidato fica registrado em `AgentRun` para revisão.
- Nunca acusa fraude: linguagem de dúvida ("pode ser"), com link para o lançamento.
- Sem dados pessoais na mensagem além do nome do merchant.

## Versionamento e testes

- Cada prompt tem um identificador e versão (`categorizacao.v1`); a versão é gravada em `AiUsage` e `AgentRun`.
- Testes com LLM simulado cobrem validação de schema, id inventado, saída inválida e estouro de orçamento.
- Mudança de prompt ou modelo exige reexecutar a avaliação de [`README.md`](README.md#avaliacao).
