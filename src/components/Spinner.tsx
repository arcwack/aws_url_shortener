import { LoaderCircle } from 'lucide-react'

interface SpinnerProps {
  className?: string
}

/** Inline loading indicator. Inherits `currentColor`. */
export default function Spinner({ className = 'h-4 w-4' }: SpinnerProps) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />
}
