import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { applyTheme, getInitialTheme, storeTheme } from '../theme'
import type { Theme } from '../theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    storeTheme(next)
  }

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="icon-btn"
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
