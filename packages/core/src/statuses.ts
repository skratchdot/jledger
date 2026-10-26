import type { Posting, Status } from './index.js';

/** An explicit posting marker overrides its transaction; an unmarked posting inherits. */
export function effectivePostingStatus(
  posting: Pick<Posting, 'status'>,
  transactionStatus: Status,
): Status {
  return posting.status || transactionStatus;
}
