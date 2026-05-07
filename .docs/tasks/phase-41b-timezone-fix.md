# Task — Correção de Fuso Horário em Transações

## Problema

Ao cadastrar uma transação com data **04/05/2026 (segunda-feira)**, ela aparece na listagem como **03/05/2026 (domingo)**. O deslocamento de -1 dia indica que a data está sendo armazenada ou exibida em UTC, enquanto o usuário está no fuso **America/Sao_Paulo (UTC-3)**.

## Causa Raiz Provável

O campo `date` da transação é um `DateTime` no Prisma (PostgreSQL `timestamp`). Quando o front-end envia `2026-05-04` (sem hora), o JS interpreta como `2026-05-04T00:00:00.000Z` (UTC), que ao converter para UTC-3 vira `2026-05-03T21:00:00` — exibindo o dia anterior.

## Escopo da Correção

### 1. Envio do formulário (front-end)
**Arquivo**: `src/app/(app)/transactions/transaction-form.tsx`

- Ao montar a data para envio, garantir que seja enviada como string `YYYY-MM-DD` pura (sem conversão para UTC)
- Não usar `new Date(dateString).toISOString()` diretamente — isso faz o shift de timezone
- Enviar como string e deixar o servidor interpretar como data local

### 2. Recebimento na API (back-end)
**Arquivo**: `src/app/api/transactions/route.ts` e `src/app/api/transactions/[id]/route.ts`

- Ao receber `date` como string `YYYY-MM-DD`, construir o `Date` com hora fixa no meio-dia UTC (`T12:00:00.000Z`) para evitar ambiguidade de fuso em qualquer direção
- Alternativa mais robusta: usar `new Date(dateString + 'T12:00:00.000Z')` — meio-dia UTC nunca cruza a meia-noite em nenhum fuso horário prático

### 3. Exibição na listagem (front-end)
**Arquivo**: `src/app/(app)/transactions/transaction-table.tsx` (ou onde a data é formatada)

- Ao formatar a data para exibição, usar `date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })` ou extrair `getUTCDate/getUTCMonth/getUTCFullYear` diretamente (sem conversão de timezone)
- Verificar se o dia da semana também é calculado a partir da data UTC ou local

### 4. Verificar outros formulários com data
- `RecurringRule` (data de início/fim)
- `CreditCardPurchase` (data da compra)
- `Goal` (data alvo)
- Aplicar o mesmo padrão consistente em todos

## Estratégia Recomendada

Usar **datas sem componente de horário** (date-only strings) em toda a pilha:

1. Front-end envia `"2026-05-04"` (string, não objeto Date)
2. API recebe a string e salva como `new Date("2026-05-04T12:00:00.000Z")` (âncora no meio-dia UTC)
3. Exibição formata extraindo os componentes UTC (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`) para reconstruir a data sem shift

Essa abordagem é simples e não exige biblioteca de timezone.

## Arquivos Prováveis

| Arquivo | Mudança |
|---|---|
| `src/app/(app)/transactions/transaction-form.tsx` | Como a data é montada antes do envio |
| `src/app/api/transactions/route.ts` | Como a string de data é convertida para `Date` |
| `src/app/api/transactions/[id]/route.ts` | Mesmo para edição |
| `src/app/(app)/transactions/transaction-table.tsx` | Como a data é formatada para exibição |
| Outros formulários com campo `date` | Auditoria e alinhamento |

## Critérios de Aceite

- [ ] Cadastrar transação como 04/05 → aparece como 04/05 na listagem
- [ ] Dia da semana exibido bate com a data correta
- [ ] Editar uma transação existente mantém a data original sem shift
- [ ] Comportamento consistente para usuários em UTC-3 (Brasília)
