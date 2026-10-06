# Testes do Finance Controller 2.0

Vitest 4, `environment: node`, `globals: true`. Testes de domínio ficam ao lado do código
(`src/**/*.test.ts`); infraestrutura comum fica aqui (`tests/`).

```
tests/
  helpers/     setup.ts (TZ e relógio), clock.ts, money.ts, factories.ts, db.ts, fixtures.ts
  fixtures/    arquivos 100% sintéticos (ver tests/fixtures/README.md)
  guards/      barreiras automáticas (dados reais, .gitignore); no-real-data.ts + scan.ts
```

## Comandos

| Comando                     | O que faz                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| `npm test`                  | Toda a suíte (inclui os guards)                                     |
| `npm run test:watch`        | Modo watch                                                          |
| `npm run test:coverage`     | Cobertura v8 (relatório; falha só se o domínio ficar abaixo de 80%) |
| `npm run guard:data`        | Só os guards (`tests/guards`), usado no CI                          |
| `npm run guard:data:staged` | Guard sobre os arquivos staged (usado no pré-commit)                |
| `npm run typecheck`         | `tsc --noEmit`                                                      |

## Regras

1. **Dados reais nunca entram no Git** (Constituição, RN-01/RN-02). Extratos, faturas, CPF, CNPJ,
   número de conta/agência/cartão, e-mails e telefones reais, saldos, salários e nomes de terceiros
   vivem apenas em `private/` (ignorado pelo Git; pasta local, nunca versionada).
2. **Fuso e relógio**: a suíte roda com `TZ=America/Sao_Paulo` (`vitest.config.mts` + `setup.ts`).
   Use `fixedNow()` (`2026-10-05T12:00:00.000Z`) ou `withFakeTime(fn)` em vez de `new Date()`.
   Datas de calendário ao meio-dia UTC (`calendarDate('2026-12-31')`).
3. **Dinheiro em centavos**: `brl('1.000,00')` -> `100000`; `cents(10.5)` -> `1050`.
4. **Fábricas**: `makeAccount/makeTxn/makeCard/makeLoan` devolvem objetos puros com ids
   determinísticos; chame `resetFactories()` em `beforeEach`.
5. **Integrações externas mockadas** (OpenAI, Telegram): nenhum teste chama serviço real.
6. **Banco de teste opcional**: `getTestDb()` devolve `null` sem `DATABASE_URL_TEST`. Com a variável,
   o nome do database precisa conter `test` ou `branch` (use um branch Neon descartável) e não pode
   ser igual a `DATABASE_URL`; caso contrário lança erro. Testes de integração usam
   `describe.skipIf(!getTestDb())`. Nunca aponte para o banco principal.

## Guard de dados (`tests/guards`)

`no-real-data.ts` exporta `findSensitivePatterns(text)` (CPF, CNPJ, agência/conta, cartão com Luhn,
e-mail, telefone BR, chave Pix aleatória) e `checkFixtureFilename`. `scan.ts` varre **todos os
arquivos de texto do repositório** (versionados ou não ignorados, mais tudo em `tests/fixtures/`),
exceto `node_modules/`, `src/generated/`, `package-lock.json`, `.next/` e `coverage/`.

- **Corrija o dado, não o detector.** Se um padrão gerar ruído sistemático, ajuste a regra com um
  teste que documente a mudança.
- **Exceções** existem apenas em `ALLOWLIST` (`tests/guards/scan.ts`): por arquivo, com **contagem
  exata** de achados por regra e um `motivo`. Se o número de achados mudar (para mais ou para
  menos) o guard falha; se o arquivo sair do repositório, a entrada obsoleta falha. `tests/fixtures/`
  nunca aceita exceção. O e-mail público do dono (identidade de commit) está liberado por valor
  exato em `ALLOWED_EMAILS`. Novas exceções exigem justificativa em revisão do `qa-revisor`.
- Os testes dos detectores montam exemplos sensíveis em tempo de execução (geradores e
  concatenação) para que o próprio código de teste não contenha um padrão real.
- No pré-commit, `.githooks/pre-commit` roda o guard sobre os arquivos staged. Ative os hooks com
  `git config core.hooksPath .githooks`.

## Checkout no Windows (CRLF)

O repositório usa `.gitattributes` (`* text=auto eol=lf`): o working tree deve ficar em LF, que é o
que o Prettier (`format:check`) e o hook bash esperam. Se o seu checkout foi feito antes do
`.gitattributes` e `npm run format:check` acusa centenas de arquivos, a alternativa **segura** é
clonar o repositório de novo (em outra pasta) e trabalhar a partir dele.

> **ATENÇÃO: o comando abaixo DESCARTA TODA alteração não commitada (arquivos modificados e
> staged).** Rode **somente** com `git status` limpo (nada modificado, nada staged). Na dúvida,
> faça commit/stash do que importa antes ou prefira o clone novo. Arquivos não rastreados não são
> removidos, mas qualquer edição em arquivo rastreado se perde.

```bash
git status                                    # precisa estar LIMPO; se não estiver, PARE
git add --renormalize .
git status                                    # confira que nada inesperado mudou
git rm --cached -r -q . && git reset --hard   # recria os arquivos já em LF (DESTRUTIVO)
```
