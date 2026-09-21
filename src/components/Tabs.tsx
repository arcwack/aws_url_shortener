import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string }>
  active: T
  onChange: (id: T) => void
}

/**
 * Underline tab bar (WAI-ARIA tabs pattern) with arrow-key navigation.
 */
export default function Tabs<T extends string>({ tabs, active, onChange }: TabsProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1
    let nextIndex = -1

    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = lastIndex

    if (nextIndex < 0) return
    const nextTab = tabs[nextIndex]
    if (!nextTab) return

    event.preventDefault()
    onChange(nextTab.id)
    buttonRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[index] = node
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              selected
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
