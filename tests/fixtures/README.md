# Fixtures sintéticas

Esta pasta é pública (repositório aberto). **Tudo aqui é inventado.** Arquivos reais de bancos
(OFX, PDF, CSV) ficam em `private/` e nunca são commitados.

## Regras (RN-01)

- Nome de arquivo sempre começa com `sintetico-` (ou `synthetic-`). Extensões permitidas: `.ofx`,
  `.csv`, `.json`, `.txt`, `.pdf`, `.md`. Exceções de nome: `README.md` e `.gitkeep`.
- Estabelecimentos genéricos inventados (`MERCADO EXEMPLO`, `POSTO MODELO`, `PADARIA TESTE`).
- Titular fictício `TITULAR EXEMPLO`; banco fictício `BANCO EXEMPLO` (código `0000`).
- Agência e conta **nunca** em formato numérico (nem fictício realista): use somente os textos
  `AGENCIA-EXEMPLO` e `CONTA-EXEMPLO`.
- Nada de CPF/CNPJ, nem "válido de gerador": use o texto `DOC-OMITIDO`.
- E-mails só em `example.com`/`example.org`/`.test`; telefones não devem existir.
- Valores redondos ou aleatórios determinísticos (semente fixa); datas em 2026.
- Fixtures **nunca** têm exceção no guard (`tests/guards`): o `.gitignore` libera
  `tests/fixtures/**` justamente por isso.

## Como gerar fixtures novas sem dados reais

1. Copie a estrutura (cabeçalho, tags, colunas) de um arquivo real que esteja em `private/`, **sem**
   copiar nenhum valor: reescreva descrições, valores e datas à mão ou por script com semente fixa.
2. Substitua titular, banco, agência, conta e documento pelos textos sintéticos acima.
3. Salve como `tests/fixtures/<tipo>/sintetico-<assunto>.<ext>`.
4. Rode `npm run guard:data` e `npm test`. Se o guard falhar, corrija o dado.
5. PDFs: serão gerados por script na task F4-02 (pasta `pdf/` só tem `.gitkeep` por enquanto).

## Arquivos

| Arquivo                                   | Conteúdo                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ofx/sintetico-conta-corrente.ofx`        | OFX 1.x, 12 lançamentos (3 créditos, 9 débitos), 1 `FITID` duplicado, 1 par de transferência, acentos e `&amp;`           |
| `csv/sintetico-extrato.csv`               | `;` como separador, vírgula decimal, cabeçalho `Data;Descrição;Valor`, 10 linhas, negativo, `31/12/2026`, `;` entre aspas |
| `telegram/sintetico-update-texto.json`    | Update de texto mínimo, `chat.id` 1, texto `uber 18 nubank`                                                               |
| `openai/sintetico-resposta-categoria.json`| Resposta de categorização mínima para o mesmo texto                                                                       |
| `pdf/.gitkeep`                            | Reservado para PDFs sintéticos (F4-02)                                                                                    |

`tests/helpers/fixtures.test.ts` valida a estrutura destes arquivos (CA-05).
