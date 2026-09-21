/**
 * Theme handling for the class-based dark mode.
 *
 * The initial class is set by an inline script in index.html (to avoid a flash
 * of the wrong theme); this module keeps React in sync and persists changes.
 */

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'snipcloud.theme'

export function getStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** Saved preference first, otherwise the Vercel-style dark default. */
export function getInitialTheme(): Theme {
  return getStoredTheme() ?? 'dark'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persistence is best-effort.
  }
}
