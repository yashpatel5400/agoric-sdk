// @ts-check

import '../../../exported';

/**
 * Tests ZCF
 * @type {ContractStartFn}
 */
const start = zcf => {
  const publicFacet = harden({
    makeInvitationForSeat: () =>
      zcf.makeInvitation(seat => {
        return seat;
      }, ''),
  });

  return { creatorFacet: zcf, publicFacet };
};

harden(start);
export { start };
