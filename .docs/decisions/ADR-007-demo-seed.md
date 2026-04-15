# ADR-007: Seed de Dados Demo

## Status

Accepted

## Context

O projeto precisa ser apresentavel para recrutadores e clientes. Um banco vazio nao demonstra o valor do sistema.

## Decision

Script de seed (`prisma/seed.ts`) que cria dados ficticios realistas:

- Usuario demo com credenciais publicas (demo@finance.com / demo1234)
- 5 contas, 12 categorias, ~80 transacoes de 3 meses, 4 regras recorrentes
- Dashboard com widgets configurados

Botao "Resetar dados demo" na pagina de configuracoes para recriar dados a qualquer momento.

## Consequences

- Qualquer pessoa pode testar o sistema sem configuracao
- Credenciais demo sao publicas (documentadas no README e landing page)
- Reset apaga TODOS os dados do usuario (nao apenas demo data)
- Seed eh idempotente (deleta usuario existente antes de recriar)
