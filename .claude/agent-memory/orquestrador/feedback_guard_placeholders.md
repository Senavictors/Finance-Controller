---
name: guard-placeholders-em-registros
description: Subagentes devem registrar provas do guard com placeholders (<cpf>, <ddd9xxxxxxxx>), nunca o número sintético por extenso — o pre-commit bloqueia
metadata:
  type: feedback
---

Desde a FC2-F0-07 o pre-commit roda `guard:data:staged`. Revisores que escrevem na task o número de prova (ex.: celular sintético) bloqueiam o commit de integração.

**Why:** na integração da F0-07 o commit foi bloqueado por um celular de prova escrito por extenso na seção Validação.

**How to apply:** em todo briefing (implementador e qa-revisor) incluir: "ao registrar provas do guard em tasks/docs, use placeholders (`<cpf>`, `<cartao>`, `<ddd9xxxxxxxx>`), nunca o valor". Fixtures novas em `tests/fixtures/` precisam do prefixo `sintetico-`. Ver [[worktree-base-e-crlf]].
