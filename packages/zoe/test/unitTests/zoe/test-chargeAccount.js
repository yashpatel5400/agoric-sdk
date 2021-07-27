// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';

import { setupMakeChargeAccount } from '../../../src/zoeService/chargeAccount';

const setup = () => {
  const runIssuerKit = makeIssuerKit('RUN', AssetKind.NAT, {
    decimalPlaces: 6,
  });
  const { makeChargeAccount, checkChargeAccount } = setupMakeChargeAccount(
    runIssuerKit.issuer,
  );
  return { makeChargeAccount, checkChargeAccount, runIssuerKit };
};

test('chargeAccount starts empty', async t => {
  const { makeChargeAccount } = setup();
  const chargeAccount = makeChargeAccount();

  t.true(AmountMath.isEmpty(chargeAccount.getCurrentAmount()));
});

test('depositing into and withdrawing from chargeAccount', async t => {
  const { makeChargeAccount, runIssuerKit } = setup();
  const chargeAccount = makeChargeAccount();

  const run1000 = AmountMath.make(runIssuerKit.brand, 1000n);
  const payment = runIssuerKit.mint.mintPayment(run1000);
  chargeAccount.deposit(payment);

  t.true(AmountMath.isEqual(chargeAccount.getCurrentAmount(), run1000));

  chargeAccount.withdraw(run1000);

  t.true(AmountMath.isEmpty(chargeAccount.getCurrentAmount()));
});

test('checkChargeAccount', async t => {
  const { makeChargeAccount, checkChargeAccount } = setup();
  const chargeAccount = makeChargeAccount();

  await t.notThrowsAsync(() => checkChargeAccount(chargeAccount));
  await t.notThrowsAsync(() =>
    checkChargeAccount(Promise.resolve(chargeAccount)),
  );
});
