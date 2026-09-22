import type { FudabaCardOrigin } from '@/ports/repositories';

// Fudaba card media is addressed by two different kinds of reader, and the
// difference is what forces the layout rule below.
//
// The owner route (`serve-owner-card-media`) serves whatever object key the row
// currently holds, so it does not care how that key is shaped. The
// compatibility namecard readers are the opposite: they reverse the stored key
// back into a public path (`namecardOriginalUrlFromObjectKey`), and that
// reversal understands only the namecards layout. Those readers run for every
// compatibility row whose status is not withdrawn or rejected -- which includes
// rows sitting in review.
//
// So a row with a compatibility origin has to hold namecards-layout keys in
// every status, not just while it is published. A card that is temporarily
// unpublished still passes through the compatibility readers on its way to and
// from moderation, and a Fudaba-layout key would throw there and take the whole
// listing down with it. An exchange row is never reached by a key-reversing
// reader, so it keeps the Fudaba layout.
export function isNamecardCompatibilityOrigin(origin: FudabaCardOrigin): boolean {
    return origin === 'guest' || origin === 'legacy';
}
