'use client'

import * as React from 'react'

/** Encolhimento do `visualViewport` (px) a partir do qual consideramos o teclado aberto. */
const KEYBOARD_THRESHOLD_PX = 150

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  viewport.addEventListener('resize', onChange)
  return () => viewport.removeEventListener('resize', onChange)
}

function getSnapshot(): boolean {
  const viewport = window.visualViewport
  if (!viewport) return false
  return window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX
}

/**
 * Detecta o teclado virtual (iOS empurra o `visualViewport`): a tab bar `fixed`
 * se esconde para não flutuar sobre o campo em foco.
 */
export function useKeyboardOpen(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
