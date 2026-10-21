/**
 * Rules for tagging people (`mentions`) on sends.
 */

import { BadRequestError } from './errorHandler';

/**
 * Reject tags on a view-once image or video. Baileys puts the tags on the
 * view-once wrapper, where WhatsApp drops them, so the message would go out
 * with no tag while the API answered 200.
 * @param viewOnce - Whether the send is view-once
 * @param mentions - People to tag
 */
export function assertTagsAllowed(
  viewOnce: boolean | undefined,
  mentions: string[] | null | undefined,
): void {
  if (viewOnce && mentions?.length) {
    throw new BadRequestError('mentions cannot be combined with viewOnce');
  }
}
