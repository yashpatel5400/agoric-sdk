// @ts-check

import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';

const { details: X } = assert;

/**
 *
 * @param {Issuer} feeIssuer
 * @returns {{
 *   makeChargeAccount: MakeChargeAccount,
 *   checkChargeAccount: CheckChargeAccount,
 * }}
 */
const setupMakeChargeAccount = feeIssuer => {
  const chargeAccounts = new WeakSet();

  /** @type {MakeChargeAccount} */
  const makeChargeAccount = () => {
    const purse = feeIssuer.makeEmptyPurse();
    /** @type {ChargeAccount} */
    const chargeAccount = Far('chargeAccount', {
      ...purse,
    });
    chargeAccounts.add(chargeAccount);

    // After keeping the purse methods, we throw away the purse
    return chargeAccount;
  };

  /** @type {CheckChargeAccount} */
  const checkChargeAccount = async chargeAccountP => {
    return E.when(chargeAccountP, ca => {
      assert(
        chargeAccounts.has(ca),
        X`A chargeAccount must be provided, not ${ca}`,
      );
      return ca;
    });
  };

  return {
    makeChargeAccount,
    checkChargeAccount,
  };

};

harden(setupMakeChargeAccount);
export { setupMakeChargeAccount};
