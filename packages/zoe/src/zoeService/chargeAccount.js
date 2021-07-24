// @ts-check

import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';

const { details: X } = assert;

/**
 *
 * @param {Issuer} feeIssuer
 * @returns {{
 *   makeChargeAccount: MakeChargeAccount,
 *   assertChargeAccount: AssertChargeAccount,
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

  /** @type {IsChargeAccount} */
  const isChargeAccount = chargeAccount =>
    E.when(chargeAccount, ca => chargeAccounts.has(ca));

  /** @type {AssertChargeAcccount} */
  const assertChargeAccount = async chargeAccount => {
    const chargeAccountProvided = await isChargeAccount(chargeAccount);
    assert(
      chargeAccountProvided,
      X`A chargeAccount must be provided, not ${chargeAccount}`,
    );
  };

  return {
    makeChargeAccount,
    assertChargeAccount,
  };
};

harden(setupMakeChargeAccount);
export { setupMakeChargeAccount };
