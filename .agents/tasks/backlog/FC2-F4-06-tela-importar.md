---
id: FC2-F4-06
title: Tela Importar
status: backlog
type: feature
phase: F4
wave: 3
owner: telas-produto
depends_on: [FC2-F4-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [imports, ui]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-023]
---

# FC2-F4-06 — Tela Importar

## Contexto
A tela Importar é a porta de entrada do fluxo "fechar o mês em ~10 minutos": escolher o arquivo (PDF, OFX ou CSV), conferir o resumo e mandar tudo para o Inbox. Mora em **Mais > Importar** (`src/app/(app)/mais/importar`), conforme a arquitetura de informação (ADR-017). Consome a API da F4-01/F4-02 e termina levando ao Inbox da F4-05.

## Problema
Sem a tela, os parsers e o pipeline só existem por API. O usuário precisa de um fluxo guiado que trate: escolha de conta, detecção do formato, senha de PDF, mapeamento de CSV, resumo antes de gravar (novos/duplicados/avisos) e histórico com desfazer.

## Objetivo
Fluxo em passos no iPhone (e desktop): **conta → arquivo → (senha | mapeamento) → resumo (dry-run) → confirmar → "Revisar N no Inbox"**, mais **histórico de importações** com desfazer.

## Fora de escopo
- Parsers e pipeline (F4-01/F4-02), Inbox (F4-05).
- Importação automática por e-mail/Open Finance (F7-01).
- Registrar o PWA como destino do menu "Abrir com" do iOS (não é suportado para PWA; ver riscos).

## Comportamento atual
Endpoints existentes: `POST /api/imports` (multipart, `dryRun`), `GET /api/imports`, `GET /api/imports/[id]`, `POST /api/imports/[id]/undo`, `GET/PUT /api/import-mappings`. Erros tipados: `FILE_TOO_LARGE`, `FORMAT_NOT_RECOGNIZED`, `MAPPING_REQUIRED` (com `headers`, `sampleRows`, `suggestedMapping`), `PDF_PASSWORD_REQUIRED`, `PDF_PASSWORD_INVALID`, `PDF_NO_TEXT_LAYER`, `ACCOUNT_KIND_MISMATCH`. Não existe tela.

## Comportamento esperado
### Passos
```text
1. Conta        escolher a conta de destino (lista com ícone do banco; cartões aparecem como "Fatura Itaú", etc.)
2. Arquivo      botão grande "Escolher arquivo" (input file: .pdf, .ofx, .csv; no desktop também arrastar e soltar)
3. Detecção     "Reconhecido: Extrato Itaú (PDF)"; permite trocar o tipo manualmente
   3a. PDF protegido  campo de senha (só em memória; "não guardamos a senha nem o arquivo")
   3b. CSV sem mapeamento  mapeador de colunas com amostra das 5 primeiras linhas e botão "Salvar para esta conta"
4. Resumo       chamada dryRun: Novas N · Duplicadas N · Ignoradas N · Com erro N · período; avisos listados (BALANCE_MISMATCH, TOTAL_MISMATCH, LOW_PARSE_CONFIDENCE, FILE_ALREADY_IMPORTED)
5. Confirmar    "Importar N lançamentos" (POST sem dryRun; reenvia o arquivo mantido em memória no navegador)
6. Concluído    "N foram para o Inbox" + botão "Revisar agora" (vai ao Inbox) + resumo de fusões (matched, transferências) vindo da F4-04
```
Histórico (rodapé ou segunda aba "Histórico"): lista de lotes recentes com tipo, conta, período, contagens, data e status; ação "Desfazer importação" com confirmação ("remove só o que ainda está no Inbox; o que você já confirmou fica").

### Layout (390×844)
Cabeçalho com voltar, indicador de passo (1/5), conteúdo em cartões de vidro, botão primário fixo no rodapé acima do home indicator (safe-area). Sem emojis; ícones `lucide-react`; cores só `var(--fc-*)`.

### Estados
- Arquivo > 4 MB: mensagem "Arquivo maior que 4 MB. Exporte um período menor." (verificado no cliente antes do upload e tratado `413`).
- Tipo não reconhecido: mensagem e opção de escolher o tipo manualmente.
- `LOW_PARSE_CONFIDENCE` ou `*_MISMATCH`: faixa de alerta "Alguns lançamentos podem estar errados. Revise com atenção no Inbox." sem bloquear.
- Progresso: spinner discreto + texto "Lendo arquivo..." (processamento ≤ ~10 s).
- Erro de rede: "Tentar de novo" mantendo o arquivo selecionado.

## Regras de negócio
- RN-01: O arquivo fica **só em memória do navegador** (estado React / `File`); não usar `localStorage`, IndexedDB nem service worker cache. A senha também só em estado, limpa após uso ou ao sair da tela.
- RN-02: Todo upload passa primeiro por `dryRun=true`; só depois do usuário confirmar o resumo é feito o POST de gravação. Se o usuário sair da tela, nada foi gravado.
- RN-03: Conta de cartão exige arquivo de fatura; conta corrente exige extrato. Filtrar/avisar antes do upload (a API também valida: `ACCOUNT_KIND_MISMATCH`).
- RN-04: O mapeador de CSV só salva o mapeamento com `PUT /api/import-mappings` se o usuário marcar "Salvar para esta conta"; o dry-run com mapeamento ainda não salvo envia `mapping` inline.
- RN-05: Desfazer só aparece para lotes `PROCESSED`; após desfazer, status `UNDONE` e contagem de `kept` exibida.
- RN-06: Após importar, invalidar caches/queries de Hoje, Lançamentos e Inbox para o contador atualizar.
- RN-07: Textos de aviso usam códigos da API mapeados para frases em português claras; nunca mostrar conteúdo de linhas (a API não devolve) nem nome de arquivo em logs.
- RN-08: Sem cores/raios/sombras literais; usar primitivos de `src/components/fc/`; valores formatados a partir de centavos.
- RN-09: Acessibilidade: ordem de foco por passo, `aria-live` para resultados, botões ≥ 44 pt, área de arrastar com alternativa por botão.
- RN-10: A tela não conhece detalhes de banco; o rótulo do tipo vem do `kind` retornado pela API (mapa `kind → rótulo` em um único arquivo).

## Critérios de aceitação
- [ ] CA-01: Fluxo completo com OFX sintético: escolher conta, arquivo, ver resumo (dry-run) e confirmar; transações aparecem no Inbox e o histórico mostra o lote.
- [ ] CA-02: PDF protegido pede senha; senha errada mostra erro claro e permite tentar de novo sem reselecionar o arquivo.
- [ ] CA-03: CSV sem mapeamento abre o mapeador com amostra e sugestão; salvar o mapeamento faz o próximo CSV da mesma conta pular essa etapa.
- [ ] CA-04: Resumo mostra Novas/Duplicadas/Ignoradas/Erro e avisos; reimportar o mesmo arquivo mostra `Novas = 0` e o aviso `FILE_ALREADY_IMPORTED`.
- [ ] CA-05: Arquivo > 4 MB é barrado no cliente; formato desconhecido mostra a opção de escolher manualmente.
- [ ] CA-06: "Desfazer importação" remove só pendentes do Inbox e mostra quantos foram mantidos.
- [ ] CA-07: Nenhum uso de `localStorage`/`IndexedDB`/cache para arquivo ou senha (`grep` no código da tela).
- [ ] CA-08: 390×844 sem rolagem horizontal; botão primário respeita safe-area; alvos ≥ 44 pt.
- [ ] CA-09: Zero cor literal na tela (`grep` de hex/rgb/hsl).
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam; verificação visual com dados sintéticos.

## Impacto técnico
### Backend
Pouco: se faltar, adicionar `mapping` inline opcional no schema Zod de `POST /api/imports` (`src/server/modules/imports/http/schemas.ts`) e `kind → rótulo` exposto no `GET /api/imports`. Sem novas tabelas.

### Frontend
Criar:
- `src/app/(app)/mais/importar/page.tsx` (fluxo) e `src/app/(app)/mais/importar/historico/page.tsx` (ou aba)
- `src/components/importar/`: `import-wizard.tsx`, `account-step.tsx`, `file-step.tsx`, `password-step.tsx`, `csv-mapper.tsx`, `import-summary.tsx`, `import-done.tsx`, `import-history.tsx`, `kind-labels.ts`, `use-import-flow.ts` (máquina de estados: `idle → fileSelected → needsPassword|needsMapping → dryRunReady → committing → done|error`)
- Link em `src/app/(app)/mais/page.tsx` ("Importar").
- Usar `fetch` com `FormData`; `AbortController` para cancelar.

### Banco de dados
Nenhum.

### Integrações
APIs internas da F4-01/F4-02.

### Segurança
Arquivo e senha efêmeros no cliente; HTTPS; nada em URL/query; sem log de conteúdo no cliente (`console.*` proibido com dados).

## Plano de implementação
- [ ] 1. Ler as rotas `api/imports/**` e `api/import-mappings` e os códigos de erro (F4-01/F4-02) e o padrão de páginas em `src/app/(app)/mais/`.
- [ ] 2. Implementar `use-import-flow` (máquina de estados pura) com testes.
- [ ] 3. Passos de conta e arquivo (picker iOS e arrastar/soltar desktop).
- [ ] 4. Passos de senha e de mapeamento CSV com amostra.
- [ ] 5. Resumo (dry-run), confirmação e tela final com atalho ao Inbox.
- [ ] 6. Histórico com desfazer.
- [ ] 7. Mapa de mensagens de erro/aviso em pt-BR.
- [ ] 8. Verificação em 390×844 e desktop; fixtures sintéticos para teste manual em `tests/fixtures/imports/`.
- [ ] 9. Atualizar `docs/ui/importar.md` e `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: máquina de estados (cada transição e erro: `PDF_PASSWORD_REQUIRED` volta a `needsPassword`; `MAPPING_REQUIRED` vai a `needsMapping`; falha de rede preserva o arquivo); mapa de mensagens cobre todos os códigos; validação de tamanho no cliente (4 MB e 4 MB + 1 byte).
- [ ] Integração: com `fetch` mockado, fluxo feliz e cada erro tipado; mapeador gera o JSON de mapeamento esperado a partir de seleção de colunas (separador `;`, valor com vírgula).
- [ ] E2E: roteiro manual/Playwright opcional com OFX sintético: importar, ver Inbox com N itens, desfazer.
- [ ] Manual: iPhone 13 Pro ou emulação — seletor de arquivos do Safari abre o app Arquivos; arquivo recebido por AirDrop/iCloud aparece; PDF sintético protegido por senha.

## Riscos e rollback
- **PWA no iOS não é destino do "Compartilhar/Abrir com"**: o usuário precisa escolher o arquivo dentro do app (fluxo já previsto); documentar na tela.
- **Memória do Safari** com PDFs grandes: limite de 4 MB.
- **Reenvio do arquivo** na confirmação dobra o upload: aceitável (≤ 4 MB) e evita guardar estado no servidor.
- Rollback: remover a rota e o link em Mais; backend permanece intacto.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
