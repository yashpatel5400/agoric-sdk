// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';

import { setupMakeChargeAccount } from '../../../src/zoeService/chargeAccount';

const setup = () => {
  const runIssuerKit = makeIssuerKit('RUN', AssetKind.NAT, {
    decimalPlaces: 6,
  });

  const purse = runIssuerKit.issuer.makeEmptyPurse();
  const {
    makeChargeAccount,
    checkChargeAccount,
    chargeFee,
  } = setupMakeChargeAccount(runIssuerKit.issuer, purse);
  return { makeChargeAccount, checkChargeAccount, chargeFee, runIssuerKit };
};

test('chargeAccount starts empty', async t => {
  const { makeChargeAccount } = setup();
  const chargeAccount = await makeChargeAccount();

  t.true(AmountMath.isEmpty(chargeAccount.getCurrentAmount()));
});

test('depositing into and withdrawing from chargeAccount', async t => {
  const { makeChargeAccount, runIssuerKit } = setup();
  const chargeAccount = await makeChargeAccount();

  const run1000 = AmountMath.make(runIssuerKit.brand, 1000n);
  const payment = runIssuerKit.mint.mintPayment(run1000);
  chargeAccount.deposit(payment);

  t.true(AmountMath.isEqual(chargeAccount.getCurrentAmount(), run1000));

  chargeAccount.withdraw(run1000);

  t.true(AmountMath.isEmpty(chargeAccount.getCurrentAmount()));
});

test('checkChargeAccount', async t => {
  const { makeChargeAccount, checkChargeAccount } = setup();
  const chargeAccount = await makeChargeAccount();

  await t.notThrowsAsync(() => checkChargeAccount(chargeAccount));
  await t.notThrowsAsync(() =>
    checkChargeAccount(Promise.resolve(chargeAccount)),
  );
});

test('chargeFee', async t => {
  const { makeChargeAccount, chargeFee, runIssuerKit } = setup();
  const chargeAccount = await makeChargeAccount();

  const run1000 = AmountMath.make(runIssuerKit.brand, 1000n);
  const payment = runIssuerKit.mint.mintPayment(run1000);
  chargeAccount.deposit(payment);

  const run10 = AmountMath.make(runIssuerKit.brand, 10n);

  await chargeFee(chargeAccount, run10);

  await chargeFee(Promise.resolve(chargeAccount), run10);

  const currentAmount = chargeAccount.getCurrentAmount();

  t.true(
    AmountMath.isEqual(
      currentAmount,
      AmountMath.make(runIssuerKit.brand, 980n),
    ),
  );
});
