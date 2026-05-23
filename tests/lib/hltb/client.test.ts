import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HltbFetchError, HltbRateLimitError } from '@/lib/errors'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))

vi.mock('howlongtobeat', () => {
  return {
    HowLongToBeatService: class {
      search = searchMock
    },
  }
})

beforeEach(() => {
  searchMock.mockReset()
})

import { searchByName } from '@/lib/hltb/client'

describe('searchByName (hltb client)', () => {
  it('returns a matched entry', async () => {
    searchMock.mockResolvedValueOnce([
      {
        id: '10',
        name: 'The Witcher 3: Wild Hunt',
        gameplayMain: 52,
        gameplayMainExtra: 105,
        gameplayCompletionist: 180,
      },
    ])
    const result = await searchByName('Witcher 3')
    expect(result).not.toBeNull()
    if (result === null || result instanceof Error) return
    expect(result.hltbId).toBe(10)
  })

  it('returns null when no candidates', async () => {
    searchMock.mockResolvedValueOnce([])
    const result = await searchByName('Some Obscure Game')
    expect(result).toBeNull()
  })

  it('returns null when no candidate clears similarity threshold', async () => {
    searchMock.mockResolvedValueOnce([
      {
        id: '1',
        name: 'Completely Unrelated',
        gameplayMain: 1,
        gameplayMainExtra: 2,
        gameplayCompletionist: 3,
      },
    ])
    const result = await searchByName('Witcher 3')
    expect(result).toBeNull()
  })

  it('returns HltbRateLimitError on a 429 error message', async () => {
    searchMock.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
    const result = await searchByName('Anything')
    expect(result).toBeInstanceOf(HltbRateLimitError)
  })

  it('returns HltbFetchError on other throws', async () => {
    searchMock.mockRejectedValueOnce(new Error('network down'))
    const result = await searchByName('Anything')
    expect(result).toBeInstanceOf(HltbFetchError)
  })
})
