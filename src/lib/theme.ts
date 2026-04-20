export const THEME_COOKIE_NAME = 'fc_theme'
export const THEME_STORAGE_KEY = 'fc_theme'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

export function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark'
}

export function resolveTheme(value: string | null | undefined): Theme | null {
  return isTheme(value) ? value : null
}

export function getInitialTheme(theme: string | null | undefined): Theme {
  return resolveTheme(theme) ?? 'light'
}

export function getThemeScript() {
  return `
    (() => {
      try {
        const storageKey = '${THEME_STORAGE_KEY}';
        const cookieName = '${THEME_COOKIE_NAME}';
        const cookieMatch = document.cookie.match(new RegExp('(?:^|; )' + cookieName + '=([^;]*)'));
        const storedTheme = window.localStorage.getItem(storageKey);
        const cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        const resolvedTheme =
          storedTheme === 'light' || storedTheme === 'dark'
            ? storedTheme
            : cookieTheme === 'light' || cookieTheme === 'dark'
              ? cookieTheme
              : window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';

        const root = document.documentElement;
        root.dataset.theme = resolvedTheme;
        root.style.colorScheme = resolvedTheme;
        root.classList.toggle('dark', resolvedTheme === 'dark');
      } catch (error) {
        // No-op: the app safely falls back to the server-rendered theme.
      }
    })();
  `
}
