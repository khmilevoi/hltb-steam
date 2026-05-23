import stringSimilarity from 'string-similarity'
import type { HltbEntry } from '@/types/game'

export type HltbCandidate = {
  name: string
  main: number | null
  mainExtra: number | null
  completionist: number | null
  id: number
}

const ROMAN: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
}

const EDITION_SUFFIX_RE =
  /\s*[:\-—]?\s*(game of the year edition|goty edition|goty|definitive edition|complete edition|enhanced edition|deluxe edition|special edition|remastered edition|remastered|directors? cut)\s*$/i

const MATCH_THRESHOLD = 0.6

export function normalizeName(input: string): string {
  let normalized = input.replace(/[™®©]/g, '').toLowerCase()
  normalized = normalized.replace(EDITION_SUFFIX_RE, '')
  normalized = normalized.replace(/[:_]/g, ' ')
  normalized = normalized.replace(/\b([ivx]+)\b/g, (match) => ROMAN[match] ?? match)
  normalized = normalized.replace(/\s+/g, ' ').trim()
  return normalized
}

export function pickBestMatch(
  candidates: HltbCandidate[],
  steamName: string,
): HltbEntry | null {
  if (candidates.length === 0) return null
  const target = normalizeName(steamName)
  const targetTokens = new Set(target.split(' ').filter(Boolean))
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(target, targetTokens, normalizeName(candidate.name)),
  }))
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best.score < MATCH_THRESHOLD) return null
  return {
    mainHours: best.candidate.main,
    mainExtraHours: best.candidate.mainExtra,
    completionistHours: best.candidate.completionist,
    hltbId: best.candidate.id,
    matchedName: best.candidate.name,
  }
}

function scoreCandidate(target: string, targetTokens: Set<string>, candidateName: string): number {
  const similarity = stringSimilarity.compareTwoStrings(target, candidateName)
  if (targetTokens.size === 0) return similarity
  const candidateTokens = new Set(candidateName.split(' ').filter(Boolean))
  let covered = 0
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) covered += 1
  }
  return similarity + (covered / targetTokens.size) * 0.5
}
