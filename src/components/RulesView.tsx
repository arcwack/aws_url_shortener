import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import PreviewBanner from './PreviewBanner'

let rowCounter = 0

function nextRowId(prefix: string): string {
  rowCounter += 1
  return `${prefix}-${rowCounter}`
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="url"
        spellCheck={false}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="card">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

export default function RulesView() {
  const [weekdayUrl, setWeekdayUrl] = useState('https://example.com/weekday')
  const [weekendUrl, setWeekendUrl] = useState('https://example.com/weekend')
  const [mobileUrl, setMobileUrl] = useState('https://example.com/mobile')
  const [desktopUrl, setDesktopUrl] = useState('https://example.com/desktop')

  const [geoRules, setGeoRules] = useState(() => [
    { id: nextRowId('geo'), country: 'IN', url: 'https://example.com/in' },
    { id: nextRowId('geo'), country: 'US', url: 'https://example.com/us' },
  ])

  const [lootBox, setLootBox] = useState(() => [
    { id: nextRowId('loot'), url: 'https://example.com/prize-a' },
    { id: nextRowId('loot'), url: 'https://example.com/prize-b' },
  ])

  function updateGeoRule(id: string, patch: Partial<{ country: string; url: string }>) {
    setGeoRules((rules) => rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  }

  function updateLootEntry(id: string, url: string) {
    setLootBox((entries) => entries.map((entry) => (entry.id === id ? { ...entry, url } : entry)))
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Smart Rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rule-based redirection: send the same short link to different destinations.
        </p>
      </header>

      <PreviewBanner>
        Preview: this editor is a mock-up. Rules are not saved and the Redirect Lambda does not use
        them yet.
      </PreviewBanner>

      <Section
        title="Time-based"
        description="Serve a different destination on weekdays and weekends."
      >
        <Field
          id="rule-weekday"
          label="Weekday URL (Mon–Fri)"
          value={weekdayUrl}
          onChange={setWeekdayUrl}
        />
        <Field
          id="rule-weekend"
          label="Weekend URL (Sat–Sun)"
          value={weekendUrl}
          onChange={setWeekendUrl}
        />
      </Section>

      <Section title="Geo / language" description="Route visitors by country or language.">
        {geoRules.map((rule) => (
          <div key={rule.id} className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor={`${rule.id}-country`} className="label">
                Country
              </label>
              <input
                id={`${rule.id}-country`}
                type="text"
                spellCheck={false}
                maxLength={2}
                placeholder="IN"
                className="input font-mono uppercase"
                value={rule.country}
                onChange={(event) =>
                  updateGeoRule(rule.id, { country: event.target.value.toUpperCase() })
                }
              />
            </div>
            <div>
              <label htmlFor={`${rule.id}-url`} className="label">
                Destination URL
              </label>
              <input
                id={`${rule.id}-url`}
                type="url"
                spellCheck={false}
                placeholder="https://example.com/in"
                className="input"
                value={rule.url}
                onChange={(event) => updateGeoRule(rule.id, { url: event.target.value })}
              />
            </div>
            <button
              type="button"
              className="icon-btn sm:mb-0.5"
              onClick={() => setGeoRules((rules) => rules.filter((item) => item.id !== rule.id))}
              aria-label={`Remove ${rule.country || 'country'} rule`}
              title={`Remove ${rule.country || 'country'} rule`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            setGeoRules((rules) => [...rules, { id: nextRowId('geo'), country: '', url: '' }])
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add country
        </button>
      </Section>

      <Section title="Device" description="Send mobile and desktop visitors to different URLs.">
        <Field id="rule-mobile" label="Mobile URL" value={mobileUrl} onChange={setMobileUrl} />
        <Field id="rule-desktop" label="Desktop URL" value={desktopUrl} onChange={setDesktopUrl} />
      </Section>

      <Section
        title="Loot box"
        description="Randomly distribute traffic across a list of destinations — useful for giveaways."
      >
        {lootBox.map((entry, index) => (
          <div key={entry.id} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full">
              <label htmlFor={`${entry.id}-url`} className="label">
                Destination {index + 1}
              </label>
              <input
                id={`${entry.id}-url`}
                type="url"
                spellCheck={false}
                placeholder="https://example.com/prize"
                className="input"
                value={entry.url}
                onChange={(event) => updateLootEntry(entry.id, event.target.value)}
              />
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLootBox((entries) => entries.filter((item) => item.id !== entry.id))}
              aria-label={`Remove destination ${index + 1}`}
              title={`Remove destination ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setLootBox((entries) => [...entries, { id: nextRowId('loot'), url: '' }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add destination
        </button>
      </Section>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Rules are kept in local component state only — nothing is sent to the API.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Coming soon</span>
          <span className="group relative inline-flex" title="Coming soon">
            <button
              type="button"
              className="btn btn-primary"
              disabled
              aria-disabled="true"
              aria-describedby="save-rules-tooltip"
            >
              Save rules
            </button>
            <span
              role="tooltip"
              id="save-rules-tooltip"
              className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            >
              Coming soon
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
