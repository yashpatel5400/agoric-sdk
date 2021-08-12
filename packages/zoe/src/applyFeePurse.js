// @ts-check

import { E } from '@agoric/eventual-send';
import { Far } from '@agoric/marshal';

/**
 * Partially apply an already existing feePurse to Zoe methods.
 *
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<FeePurse>} feePurse
 * @returns {ZoeServiceWFeePurseApplied}
 */
const applyFeePurse = (zoe, feePurse) => {
  return Far('ZoeServiceWFeePurseApplied', {
    makeFeePurse: (...args) => E(zoe).makeFeePurse(...args),

    // A feePurse is required
    install: (...args) => E(zoe).install(feePurse, ...args),
    startInstance: (...args) => E(zoe).startInstance(feePurse, ...args),
    offer: (...args) => E(zoe).offer(feePurse, ...args),
    getPublicFacet: (...args) => E(zoe).getPublicFacet(feePurse, ...args),

    // The functions below are getters only and have no impact on
    // state within Zoe
    getInvitationIssuer: () => E(zoe).getInvitationIssuer(),
    getFeeIssuer: () => E(zoe).getFeeIssuer(),
    getBrands: (...args) => E(zoe).getBrands(...args),
    getIssuers: (...args) => E(zoe).getIssuers(...args),
    getTerms: (...args) => E(zoe).getTerms(...args),
    getInstance: (...args) => E(zoe).getInstance(...args),
    getInstallation: (...args) => E(zoe).getInstallation(...args),
    getInvitationDetails: (...args) => E(zoe).getInvitationDetails(...args),
    getInstallationForInstance: (...args) =>
      E(zoe).getInstallationForInstance(...args),
  });
};

/**
 * Make a new feePurse and then partially apply it to Zoe methods.
 *
 * @param {ZoeService} zoe
 * @returns {{ zoeService: ZoeServiceWFeePurseApplied, feePurse: Promise<FeePurse> }}
 */
const makeAndApplyFeePurse = zoe => {
  const feePurse = E(zoe).makeFeePurse();
  return harden({ zoeService: applyFeePurse(zoe, feePurse), feePurse });
};

harden(applyFeePurse);
harden(makeAndApplyFeePurse);
export { applyFeePurse, makeAndApplyFeePurse };
