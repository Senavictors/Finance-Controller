---
name: matar-processos-so-por-pid
description: Subagentes nunca podem encerrar processos por nome de imagem (taskkill /IM chrome.exe); só pelo PID que eles mesmos iniciaram
metadata:
  type: feedback
---

Encerrar processos de teste (Chrome headless, next start, node) só pelo PID capturado ao iniciar, ou com perfil isolado (`--user-data-dir` temporário) e kill do PID. Nunca `taskkill /IM chrome.exe`, `pkill chrome`, `taskkill /IM node.exe`.

**Why:** em 2026-10-06 o qa-revisor da FC2-F0-05 rodou `taskkill /IM chrome.exe` e fechou todas as janelas do Chrome do dono.

**How to apply:** incluir no briefing de todo agente que suba navegador ou servidor: "inicie com perfil temporário, guarde o PID e encerre só esse PID". Ver [[worktree-base-e-crlf]].
