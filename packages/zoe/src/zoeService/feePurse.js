// @ts-check

import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';

const { details: X } = assert;

/**
 *
 * @param {Issuer} feeIssuer
 * @returns {{
 *   makeFeePurse: MakeFeePurse
 *   chargeZoeFee: ChargeZoeFee,
 * }}
 */
const setupMakeFeePurse = feeIssuer => {
  const feePurses = new WeakSet();

  // TODO: distribute
  const collectionPurse = feeIssuer.makeEmptyPurse();

  /** @type {MakeFeePurse} */
  const makeFeePurse = async () => {
    const purse = feeIssuer.makeEmptyPurse();
    /** @type {FeePurse} */
    const feePurse = Far('feePurse', {
      ...purse,
    });
    feePurses.add(feePurse);

    // After keeping the purse methods, we throw away the purse
    return feePurse;
  };

  /** @type {ChargeZoeFee} */
  const chargeZoeFee = (feePurse, feeAmount) => {
    return E.when(feePurse, fp => {
      assert(feePurses.has(fp), X`A feePurse must be provided, not ${fp}`);
      collectionPurse.deposit(fp.withdraw(feeAmount));
    });
  };

  return {
    makeFeePurse,
    chargeZoeFee,
  };
};

harden(setupMakeFeePurse);
export { setupMakeFeePurse };
