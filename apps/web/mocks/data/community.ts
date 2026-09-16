import type { NamecardReactions } from "@imsweb/contracts/namecards"

/**
 * Factories for the community card reaction counters. `app/lib/api/endpoints/
 * community.ts` parses `GET /api/reactions` with `reactionSchema`, a record of
 * emoji to non-negative count, so there are no required keys to enumerate.
 */
export function makeNamecardReactions(
  overrides: NamecardReactions = {}
): NamecardReactions {
  return {
    "👍": 3,
    "❤️": 1,
    ...overrides,
  }
}
