---
id: FC2-F0-07
title: Fundação de testes e CI (fixtures anonimizadas)
status: active
type: chore
phase: F0
wave: 2
owner: qa-revisor
depends_on: [FC2-F0-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [tests, ci, gitignore, githooks, vitest]
related_use_cases: []
related_adrs: [ADR-016, ADR-023, ADR-031]
---

# FC2-F0-07 — Fundação de testes e CI (fixtures anonimizadas)

## Contexto
O repositório é **público** e o produto lida com dados financeiros pessoais. A Constituição do projeto proíbe dados reais no Git: extratos, faturas, CPF, números de conta/cartão, saldos, salários e nomes de terceiros ficam em `private/` (ignorado). Os parsers de importação (F4), o motor de regras, o ledger e as engines precisam de fixtures realistas, mas 100% sintéticas, e de uma barreira automática que impeça um vazamento acidental. O 1.x tem Vitest 4 (`vitest.config.mts`, `globals: true`, testes ao lado do código), CI que roda `npm run build` (que executa `prisma migrate deploy` e exige banco) e um `.gitignore` que **ignora `.claude/`**, o que conflita com o 2.0 (que versiona `.claude/agents` e `.claude/skills`).

## Problema
- Não existe convenção de fixtures nem teste que falhe se aparecerem padrões de CPF/conta em `tests/fixtures`.
- `.gitignore` não ignora `private/` e ignora `.claude/` inteiro (os agentes do 2.0 não seriam versionados).
- O CI usa `npm run build`, que roda `prisma migrate deploy` (precisa de `DATABASE_URL` real) e não roda os testes.
- Falta infraestrutura comum de teste: relógio fixo, fábricas de dados, banco de teste opcional.

## Objetivo
1. Estrutura `tests/` com helpers, fixtures sintéticas e guardas automáticos.
2. Guard `no-real-data` que falha ao detectar padrões de CPF, CNPJ, conta/agência, cartão (Luhn), e-mail e telefone reais em `tests/fixtures`.
3. `.gitignore` com `private/` e demais proteções; liberar `.claude/` versionado.
4. CI: `lint`, `format:check`, `test`, `next build` (sem migrate) e o guard.
5. Hook local opcional que roda o guard no pré-commit.

## Fora de escopo
- Escrever os testes de cada engine (cada task cria os seus).
- Fixtures PDF sintéticas (F4-02 as gera; aqui só a pasta e a regra) e fixtures OFX/CSV reais de bancos.
- Testes E2E de navegador (Playwright) e de Lighthouse (F6-04).
- Cobertura mínima global obrigatória (só relatório e limites por pasta de domínio, ver abaixo).

## Comportamento atual
- `vitest.config.mts`: `environment: 'node'`, `globals: true`, `clearMocks`, `restoreMocks`, `resolve.tsconfigPaths: true`; sem `include` explícito (padrão `**/*.test.ts`), sem cobertura.
- Scripts: `"test": "vitest run"`, `"build": "prisma migrate deploy && next build"`.
- `.github/workflows/ci.yml`: Node 22, `npm ci`, `npx prisma generate`, `npm run lint`, `npm run format:check`, `npm run build`.
- `.githooks/pre-commit`: só valida identidade Git (Senavictors).
- `.gitignore` (1.x) contém `.claude/` e `design_system/` (seção "local AI tooling") e não menciona `private/`.

## Comportamento esperado
### Estrutura
```
tests/
  README.md                     regras de fixtures (o que pode e o que não pode)
  helpers/
    clock.ts                    fixedNow('2026-10-05T12:00:00.000Z'), withFakeTime(fn)
    factories.ts                makeAccount/makeTxn/makeCard/makeLoan (objetos puros, ids determinísticos)
    money.ts                    brl('1.000,00') -> 100000; cents(10.5) -> 1050
    db.ts                       getTestDb(): usa DATABASE_URL_TEST; retorna null se ausente
  fixtures/
    README.md                   convenções e lista de arquivos
    ofx/sintetico-conta-corrente.ofx
    csv/sintetico-extrato.csv
    pdf/.gitkeep                F4-02 popula com PDFs gerados por script
    telegram/sintetico-update-texto.json
    openai/sintetico-resposta-categoria.json
  guards/
    no-real-data.ts             detectores puros (exporta findSensitivePatterns)
    no-real-data.test.ts        varre tests/fixtures; testa os próprios detectores
    no-literal-colors.test.ts   (criado pela F0-04; este task só garante que roda)
```
- `vitest.config.mts`: `include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'prisma/**/*.test.ts', 'scripts/**/*.test.ts']`; `coverage` com provider `v8` (`@vitest/coverage-v8` em devDependencies), reporters `text` e `lcov`, `include: ['src/server/modules/**/domain/**', 'src/lib/**']`, e limites mínimos de 80% de linhas/ramos **apenas** para `src/server/modules/**/domain/**` (relatório sem falhar enquanto não houver domínio: aplicar `thresholds` com `perFile: false` e `skipFull`); `setupFiles: ['tests/helpers/setup.ts']` (define `TZ=America/Sao_Paulo` para provar que o domínio não depende do fuso do runner, e `vi.useRealTimers` por padrão).
- Scripts novos em `package.json`: `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`, `"guard:data": "vitest run tests/guards"`, `"typecheck": "tsc --noEmit"`.

### Fixtures 100% sintéticas
- Nome de arquivo sempre começa com `sintetico-` (ou `synthetic-`).
- Conteúdo: estabelecimentos genéricos inventados (ex.: "MERCADO EXEMPLO", "POSTO MODELO", "PADARIA TESTE"), valores redondos ou aleatórios determinísticos (semente fixa), datas em 2026, titular fictício "TITULAR EXEMPLO", banco fictício "BANCO EXEMPLO" (códigos de banco como `0000`), agência e conta **nunca** em formato numérico (nem fictício realista): usar apenas o texto `AGENCIA-EXEMPLO` e `CONTA-EXEMPLO`. Nada de CPF/CNPJ (mesmo "válido de gerador"): usar o texto `DOC-OMITIDO`.
- `sintetico-conta-corrente.ofx`: cabeçalho OFX 1.x, 12 transações (3 créditos, 9 débitos) com `FITID` únicos, incluindo 1 duplicata exata (mesmo `FITID`) para testar `importHash`, 1 par de transferência (débito e crédito com mesmo valor/data), 1 lançamento com acento e caracteres de escape.
- `sintetico-extrato.csv`: separador `;`, decimal `,`, cabeçalho `Data;Descrição;Valor`, 10 linhas, incluindo valor negativo, data `31/12/2026`, descrição com `;` entre aspas e linha em branco final.
- `telegram/…json` e `openai/…json`: payloads mínimos com `chat.id` fictício `1` e texto "uber 18 nubank".

### Guard `no-real-data`
`tests/guards/no-real-data.ts` exporta `findSensitivePatterns(text): Finding[]` (`{rule, match, line}`) com as regras:
- `cpf`: `\b\d{3}\.\d{3}\.\d{3}-\d{2}\b` e 11 dígitos contíguos que passem no cálculo de dígitos verificadores de CPF.
- `cnpj`: `\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b` e 14 dígitos contíguos com dígitos verificadores válidos.
- `agencia-conta`: `(ag[eê]ncia|ag\.?)\s*[:\-]?\s*\d{3,5}` e `(conta( corrente)?|c/c|cc)\s*[:\-]?\s*\d{4,}-?\d?` (case-insensitive).
- `cartao`: sequências de 13-19 dígitos (com ou sem espaços/hífens) que passem no algoritmo de Luhn.
- `email`: qualquer e-mail (domínio com ponto e TLD; `usuario@localhost` e URLs de conexão não contam) cujo domínio não seja `example.com`, `example.org` ou termine em `.test`/`.invalid`.
- `telefone-br`: `\(?\d{2}\)?\s?9?\d{4}-?\d{4}` com DDD.
- `chave-pix-aleatoria`: UUID v4 em contexto `pix`/`chave`.
- `filename`: nome de arquivo em `tests/fixtures` que não começa com `sintetico-`/`synthetic-` (exceto `README.md` e `.gitkeep`) ou extensão fora de `.ofx .csv .json .txt .pdf .md`.
`no-real-data.test.ts`: (a) varre recursivamente `tests/fixtures/**` e `docs/**` e `.agents/**` e **falha** se houver qualquer `Finding`; (b) testa os detectores com exemplos montados **em tempo de execução por concatenação** (para que o próprio código de teste não contenha um padrão real), com casos positivos e negativos (ver Estratégia). Arquivos binários (`.pdf`) só têm o nome validado e, se tiverem camada de texto extraível por `pdftotext` disponível, o texto passa pelo detector (opcional, ignorado se a ferramenta não existir).

### `.gitignore`
Acrescentar (sem remover o resto):
```gitignore
# dados reais: nunca versionar (Constituição)
/private/
/imports/
*.ofx
*.qfx
*.pdf
!/tests/fixtures/**/*.ofx
!/tests/fixtures/**/*.pdf
.env*
!.env.example
```
Remover as linhas `.claude/` e `design_system/` e substituir por `.claude/settings.local.json`, `.claude/worktrees/` e `.codex/*.local.*` (os agentes e skills do 2.0 em `.claude/agents`, `.claude/skills`, `.claude/rules`, `.claude/settings.json` passam a ser versionados). Criar `private/.gitkeep`? **Não** (a pasta inteira é ignorada); documentar em `tests/README.md` e `docs/` que `private/` é local.

### CI (`.github/workflows/ci.yml`)
Jobs em sequência no mesmo job `verify` (Node 22, cache npm): `npm ci` → `npx prisma generate` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm test` (inclui guards) → `npx next build` com `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci` (apenas para o build não quebrar na leitura da variável; **sem** `prisma migrate deploy`). Gatilhos `push` em `main` e `pull_request`. Passo final `npm run guard:data`. Nenhum segredo no workflow.
`package.json`: manter `"build"` como está (a Vercel precisa do `migrate deploy`), mas documentar em `AGENTS.md`/`README.md` que CI e validação local usam `npx next build`.

### Hook local
`.githooks/pre-commit`: manter a validação de identidade e acrescentar, para arquivos staged em `tests/fixtures/`, `docs/` ou `.agents/`, a execução de `npm run guard:data` (falha o commit). Respeitar `bootstrap-audit`/`bootstrap-install-hook` do plugin (não duplicar: se o hook do plugin existir, chamar via include documentado).

### Banco de teste (opcional)
`tests/helpers/db.ts`: `getTestDb()` retorna um `PrismaClient` somente se `DATABASE_URL_TEST` estiver definido e contiver `test` ou `branch` no nome do database; caso contrário `null` e os testes de integração usam `describe.skipIf(!process.env.DATABASE_URL_TEST)`. Nunca apontar para o banco principal. Documentar uso de um branch Neon descartável.

## Regras de negócio
- RN-01: Nenhum dado financeiro real em `tests/`, `docs/` ou `.agents/`; fixtures são sintéticas e prefixadas `sintetico-`.
- RN-02: Arquivos reais (PDF/OFX/CSV de bancos) vivem apenas em `private/` (gitignored).
- RN-03: O guard é bloqueante em CI e no pré-commit; exceções não existem (corrigir o dado, não o detector).
- RN-04: O CI nunca executa migrations nem usa banco real.
- RN-05: Testes de domínio rodam com `TZ=America/Sao_Paulo` para expor dependência de fuso; relógio sempre injetado ou fixo.
- RN-06: Testes de integração com banco só rodam contra `DATABASE_URL_TEST` explícito.

## Critérios de aceitação
- [ ] CA-01: `npm run guard:data` passa no estado final; ao colocar em `tests/fixtures/ofx/sintetico-x.ofx` uma linha com um CPF de formato válido (gerado no momento do teste manual) ou um e-mail de domínio público de provedor (montado no momento do teste manual), o comando **falha** apontando arquivo e linha (registrar a evidência e reverter).
- [ ] CA-02: Um arquivo `tests/fixtures/csv/extrato-real.csv` (sem prefixo) faz o guard falhar pela regra `filename`.
- [ ] CA-03: `git check-ignore -v private/qualquer.pdf` e `git check-ignore -v meu-extrato.ofx` retornam regra; `git check-ignore -v tests/fixtures/ofx/sintetico-conta-corrente.ofx` **não** retorna (está versionável); `git check-ignore -v .claude/agents/dados-prisma.md` não retorna (versionável) e `.claude/settings.local.json` retorna.
- [ ] CA-04: `.github/workflows/ci.yml` executa, nesta ordem: install, generate, lint, format:check, typecheck, test, next build; e **não** contém `migrate`; um PR com teste quebrado falha o CI (verificar pelo histórico do Actions ou simulando localmente com `act` quando disponível).
- [ ] CA-05: Os arquivos de `tests/fixtures/` listados existem, têm o prefixo `sintetico-` e o OFX contém uma duplicata de `FITID` e um par de transferência.
- [ ] CA-06: `npm test` roda com `TZ=America/Sao_Paulo` (um teste `tests/helpers/tz.test.ts` afirma `process.env.TZ`) e `fixedNow()` devolve `2026-10-05T12:00:00.000Z`.
- [ ] CA-07: `npm run test:coverage` gera relatório sem falhar enquanto não houver arquivos em `**/domain/**` (ou falha apenas se houver domínio com cobertura < 80%).
- [ ] CA-08: `tests/README.md` e `tests/fixtures/README.md` explicam a regra e como gerar fixtures novas sem dados reais.
- [ ] CA-09: Pré-commit bloqueia (exit != 0) um commit que adiciona um e-mail real a `docs/` e permite um commit sem violações.
- [ ] CA-10: `getTestDb()` retorna `null` sem `DATABASE_URL_TEST` e lança erro se a URL apontar para um database cujo nome não contenha `test`/`branch`.

## Impacto técnico
### Backend
Nenhum código de aplicação. Helpers de teste e guard.
### Frontend
Nenhum.
### Banco de dados
Nenhum (apenas o helper opcional de banco de teste).
### Integrações
GitHub Actions. Opcional: Neon branch descartável para testes de integração futuros.
### Segurança
É a barreira principal contra vazamento em repositório público: guard de dados, `.gitignore` de `private/` e extensões de extrato, hook de pré-commit. Reforça a Constituição sem depender de disciplina manual.

## Plano de implementação
- [ ] Etapa 1 — Ler `.agents/test-onboarding.md` (Constituição), `AGENTS.md`, `.gitignore`, `vitest.config.mts`, `.github/workflows/ci.yml`, `.githooks/pre-commit`.
- [ ] Etapa 2 — `.gitignore` (adições e remoção de `.claude/`); conferir com `git check-ignore` (CA-03).
- [ ] Etapa 3 — `vitest.config.mts`, `tests/helpers/*`, `setup.ts`, scripts do `package.json`, `@vitest/coverage-v8`.
- [ ] Etapa 4 — Fixtures sintéticas e READMEs (CA-05, CA-08).
- [ ] Etapa 5 — `tests/guards/no-real-data.ts` + `.test.ts` (detectores, Luhn, DV de CPF/CNPJ).
- [ ] Etapa 6 — CI (`ci.yml`) e hook (`.githooks/pre-commit`).
- [ ] Etapa 7 — Provas negativas do guard (CA-01, CA-02, CA-09), registradas em "Validação" e revertidas.
- [ ] Etapa 8 — Atualizar `AGENTS.md` (comando `npm run guard:data`, aviso do `build`), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `chore(f0-07): fundacao de testes, ci e guard de dados`.

## Estratégia de testes
- [ ] Unitários (`no-real-data.test.ts`), exemplos montados por concatenação em tempo de execução: CPF formatado válido -> detecta; CPF com pontuação (três grupos de 3 dígitos, hífen e 2 dígitos finais) é **sempre** sinalizado, mesmo com DV inválido (decisão: pontuação de CPF nunca é aceitável em fixtures/docs); 11 dígitos contíguos com DV válido -> detecta; 11 dígitos quaisquer com DV inválido -> não detecta; 11 dígitos precedidos de `R$` e seguidos de vírgula e centavos (valor monetário) -> não detecta como CPF (fixar o comportamento em teste); CNPJ formatado -> detecta; número de cartão de teste público que passa Luhn (ex.: o número de teste de documentação de gateways) -> detecta (deve ser removido das fixtures de qualquer forma); 16 dígitos sem Luhn -> não detecta; a palavra "agencia" seguida de um número de 4 dígitos e a palavra "conta" seguida de número com dígito verificador (montados em tempo de execução) -> detecta; "agenda 2026" -> não detecta; e-mail de domínio `example.com` -> permitido; e-mail de provedor público (montado em tempo de execução) -> detecta; telefone com DDD entre parênteses e 9 dígitos (montado em tempo de execução) -> detecta; valor `1.234,56` e data `05/10/2026` -> não detecta; texto vazio -> sem findings.
- [ ] Integração: guard varrendo `tests/fixtures/**` real (CA-01); `getTestDb` com URLs válidas/ inválidas.
- [ ] E2E: não aplicável.
- [ ] Manual: abrir PR de teste com falha proposital de lint e outro com dado real em fixture; ambos devem falhar no CI.

## Riscos e rollback
- **Falso positivo** do guard bloqueando commits legítimos (ex.: texto de documentação com número parecido com CPF): reformular o texto; **não** criar exceções. Se um padrão gerar ruído sistemático, ajustar a regra com teste que documente a mudança.
- **Falso negativo** (dado real em formato inesperado): o guard é uma rede de proteção, não a única defesa; revisões do `qa-revisor` seguem obrigatórias.
- **Liberar `.claude/`** no Git pode versionar configuração local: por isso o ignore específico de `settings.local.json`, `worktrees/`.
- **`*.pdf` ignorado** pode ocultar PDFs legítimos de docs: usar `git add -f` apenas para fixtures sintéticas (ou manter a exceção `!tests/fixtures/**/*.pdf`).
- **CI sem banco**: se `next build` precisar da conexão em tempo de build, usar a URL falsa documentada; se ainda falhar, tornar `src/server/db.ts` preguiçoso (tarefa de F0-02/F0-06).
- Rollback: `git revert`; nenhuma alteração de dados.

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
