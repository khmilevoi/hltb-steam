import { describe, expect, it } from 'vitest'
import { normalizeName, pickBestMatch } from '@/lib/hltb/matcher'

describe('normalizeName', () => {
  it('strips ™ and ®', () => {
    expect(normalizeName('Counter-Strike™ 2®')).toBe('counter-strike 2')
  })

  it('lowercases', () => {
    expect(normalizeName('Hades')).toBe('hades')
  })

  it('converts roman numerals up to X to arabic at word boundaries', () => {
    expect(normalizeName('Civilization VI')).toBe('civilization 6')
    expect(normalizeName('Final Fantasy IX')).toBe('final fantasy 9')
    expect(normalizeName('Diablo III')).toBe('diablo 3')
  })

  it('strips trailing edition/GOTY suffix', () => {
    expect(normalizeName('Skyrim - Special Edition')).toBe('skyrim')
    expect(normalizeName('The Witcher 3: Game of the Year Edition')).toBe('the witcher 3')
    expect(normalizeName('Borderlands GOTY')).toBe('borderlands')
  })

  it('collapses extra whitespace', () => {
    expect(normalizeName('  Hello   World  ')).toBe('hello world')
  })
})

describe('pickBestMatch', () => {
  const candidates = [
    { name: 'The Witcher 3: Wild Hunt', main: 52, mainExtra: 105, completionist: 180, id: 10 },
    { name: 'The Witcher', main: 12, mainExtra: 18, completionist: 30, id: 20 },
    { name: 'Witcher Adventure', main: 5, mainExtra: 8, completionist: 12, id: 30 },
  ]

  it('returns best fuzzy match', () => {
    const result = pickBestMatch(candidates, 'Witcher 3')
    expect(result?.matchedName).toBe('The Witcher 3: Wild Hunt')
    expect(result?.hltbId).toBe(10)
  })

  it('returns null when no candidate is above the similarity threshold', () => {
    expect(pickBestMatch(candidates, 'Doom Eternal')).toBeNull()
  })

  it('returns null on empty candidate list', () => {
    expect(pickBestMatch([], 'anything')).toBeNull()
  })

  it('maps candidate fields to HltbEntry shape', () => {
    const result = pickBestMatch(candidates, 'The Witcher')
    expect(result).toEqual({
      mainHours: 12,
      mainExtraHours: 18,
      completionistHours: 30,
      hltbId: 20,
      matchedName: 'The Witcher',
    })
  })
})
