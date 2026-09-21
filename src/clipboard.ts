/**
 * Copy text to the clipboard.
 *
 * Uses the async Clipboard API when available and falls back to a hidden
 * textarea + execCommand for non-secure contexts. Resolves to `true` on
 * success, `false` otherwise (never throws).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy approach.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const succeeded = document.execCommand('copy')
    document.body.removeChild(textarea)
    return succeeded
  } catch {
    return false
  }
}
