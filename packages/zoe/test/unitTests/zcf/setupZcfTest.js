/* global __dirname */
// @ts-check

import { E } from '@agoric/eventual-send';
import bundleSource from '@agoric/bundle-source';
import { assert } from '@agoric/assert';
import { AmountMath } from '@agoric/ertp';

// noinspection ES6PreferShortImport
import { makeZoe } from '../../../src/zoeService/zoe';
import { makeFakeVatAdmin } from '../../../tools/fakeVatAdmin';
import { applyChargeAccount } from '../../../src/useChargeAccount';

const contractRoot = `${__dirname}/zcfTesterContract`;

export const setupZCFTest = async (
  issuerKeywordRecord,
  terms,
  fees,
  startingBalance,
) => {
  /** @type {ContractFacet} */
  let zcf;
  const setZCF = jig => {
    zcf = jig.zcf;
  };
  // The contract provides the `zcf` via `setTestJig` upon `start`.
  const fakeVatAdmin = makeFakeVatAdmin(setZCF);
  const { /** @type {ERef<ZoeService>} */ zoeService, feeIssuerKit } = makeZoe(
    fakeVatAdmin.admin,
    fees,
  );

  // Set up chargeAccount
  const chargeAccount = E(zoeService).makeChargeAccount();
  const run1000 = AmountMath.make(feeIssuerKit.brand, startingBalance);
  const payment = feeIssuerKit.mint.mintPayment(run1000);
  await E(chargeAccount).deposit(payment);

  const zoe = applyChargeAccount(zoeService, chargeAccount);
  const bundle = await bundleSource(contractRoot);
  const installation = await E(zoe).install(bundle);
  const { creatorFacet, instance } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );
  const { vatAdminState } = fakeVatAdmin;
  // @ts-ignore fix types to understand that zcf is always defined
  assert(zcf !== undefined);
  return {
    zoe,
    zcf,
    instance,
    installation,
    creatorFacet,
    vatAdminState,
    feeIssuerKit,
    chargeAccount,
  };
};
