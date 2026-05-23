import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePersistedSortColumns } from '@/components/library-table/use-persisted-sort-columns'
import { SORT_STORAGE_KEY } from '@/components/library-table/types'

describe('usePersistedSortColumns', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns the default when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('loads a valid stored value', () => {
    window.localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify([{ columnKey: 'steamHours', direction: 'DESC' }]),
    )
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'steamHours', direction: 'DESC' }])
  })

  it('falls back to default when stored value uses the legacy {id, desc} shape', () => {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify([{ id: 'name', desc: false }]))
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('falls back to default when stored value is malformed JSON', () => {
    window.localStorage.setItem(SORT_STORAGE_KEY, '{not json')
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('falls back to default when stored value references an unknown column key', () => {
    window.localStorage.setItem(
      SORT_STORAGE_KEY,
      JSON.stringify([{ columnKey: 'ghost', direction: 'ASC' }]),
    )
    const { result } = renderHook(() => usePersistedSortColumns())
    expect(result.current[0]).toEqual([{ columnKey: 'name', direction: 'ASC' }])
  })

  it('persists changes back to localStorage', () => {
    const { result } = renderHook(() => usePersistedSortColumns())
    act(() => {
      result.current[1]([{ columnKey: 'hltbMain', direction: 'DESC' }])
    })
    expect(window.localStorage.getItem(SORT_STORAGE_KEY)).toBe(
      JSON.stringify([{ columnKey: 'hltbMain', direction: 'DESC' }]),
    )
  })
})
