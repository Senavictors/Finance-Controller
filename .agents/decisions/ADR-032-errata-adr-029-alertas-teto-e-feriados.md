---
id: ADR-032
title: Errata do ADR-029 — níveis de alerta do teto MEI e feriados considerados
status: proposed
date: 2026-10-07
deciders: [orquestrador (sob autorização geral do dono em 2026-10-07; ratificação pendente)]
related_tasks: [FC2-F1-06, FC2-F3-02, FC2-F3-05, FC2-F5-05]
supersedes: []
amends: [ADR-029]
---

# ADR-032 — Errata do ADR-029: alertas do teto MEI e feriados

## Contexto
A revisão QA da FC2-F1-06 (2026-10-07) encontrou duas divergências entre o ADR-029 (aceito) e a task FC2-F1-06, que a implementação seguiu:

1. **Alertas do teto**: ADR-029 define 80% (atenção), 95% (crítico) e aviso quando a projeção anual passa do teto; a task define 80% / 100% / 120%.
2. **Feriados**: ADR-029 diz que a tabela de feriados inclui Carnaval e Corpus Christi; a task usa só feriados nacionais oficiais e trata Carnaval/Corpus Christi como folga informada pelo usuário (`extraDaysOff`).

O dono estava ausente e deu autorização geral para o orquestrador seguir com as demandas sem aprovação na hora. O ADR-029 não é reescrito; esta errata registra a decisão e fica **proposta até o dono ratificar**.

## Decisão (provisória)
1. **Alertas do teto MEI — união dos dois critérios**: `ATTENTION` em 80%, `CRITICAL` em 95%, `EXCEEDED` em 100% e `SEVERE` em 120% do teto proporcional, além do aviso de projeção (`projectedCents > ceilingCents`) já previsto no ADR-029. Motivo: 95% dá o alerta antecipado do ADR; 100% e 120% têm significado prático no regime do MEI (excesso até 20% x acima de 20%), a confirmar pelo dono.
2. **Feriados**: só feriados nacionais oficiais são calculados (fixos + Sexta-feira Santa); Carnaval e Corpus Christi (ponto facultativo) entram como folga informada pelo usuário em `extraDaysOff`. Motivo: não são feriados nacionais por lei e a folga depende do contratante.
3. **Premissas da F1-06 mantidas como padrão configurável**: adicional por dia presencial apurado no **mês anterior** ao pagamento (`PREVIOUS_MONTH`) e pagamento em dia não útil movido para o **próximo dia útil** (`NEXT_BUSINESS_DAY`).

## Consequências
- `mei-ceiling`/`meiLevel` passam a ter quatro níveis acima de `OK`; testes nas bordas 80/95/100/120%.
- FC2-F3-02, FC2-F3-05 e FC2-F5-05 (alertas) consomem os quatro níveis.
- Se o dono não ratificar, reverter para o critério escolhido e atualizar testes.

## Ratificação
- [ ] Dono confirma itens 1, 2 e 3 (ou indica ajustes).
