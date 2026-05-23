'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

type Props = { direction: 'ASC' | 'DESC' | undefined }

export function SortIcon({ direction }: Props) {
  if (direction === 'ASC') return <ArrowUp aria-hidden="true" className="ml-1 inline" />
  if (direction === 'DESC') return <ArrowDown aria-hidden="true" className="ml-1 inline" />
  return <ArrowUpDown aria-hidden="true" className="ml-1 inline opacity-40" />
}
