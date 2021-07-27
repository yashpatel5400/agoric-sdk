// @ts-check

import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';

const { details: X } = assert;

/**
 *
 * @param {Issuer} feeIssuer
 * @param {Purse} feePurse
 * @returns {{
 *   makeChargeAccount: MakeChargeAccount,
 *   checkChargeAccount: CheckChargeAccount,
 *   chargeFee: ChargeFee,
 * }}
 */
const setupMakeChargeAccount = (feeIssuer, feePurse) => {
  const chargeAccounts = new WeakSet();

  /** @type {MakeChargeAccount} */
  const makeChargeAccount = async () => {
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

  /** @type {ChargeFee} */
  const chargeFee = async (chargeAccountP, fee) => {
    return E.when(chargeAccountP, async ca => {
      assert(
        chargeAccounts.has(ca),
        X`A chargeAccount must be provided, not ${ca}`,
      );
      const payment = ca.withdraw(fee);
      feePurse.deposit(payment);
      return ca;
    });
  };

  return {
    makeChargeAccount,
    checkChargeAccount,
    chargeFee,
  };
};

harden(setupMakeChargeAccount);
export { setupMakeChargeAccount };
