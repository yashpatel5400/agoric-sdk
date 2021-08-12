// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';

import { setupMakeFeePurse } from '../../../src/zoeService/feePurse.js';

const setup = () => {
  const runIssuerKit = makeIssuerKit('RUN', AssetKind.NAT, {
    decimalPlaces: 6,
  });
  const { makeFeePurse, assertFeePurse } = setupMakeFeePurse(
    runIssuerKit.issuer,
  );
  return { makeFeePurse, assertFeePurse, runIssuerKit };
};

test('feePurse starts empty', async t => {
  const { makeFeePurse } = setup();
  const feePurse = await makeFeePurse();

  t.true(AmountMath.isEmpty(feePurse.getCurrentAmount()));
});

test('depositing into and withdrawing from feePurse', async t => {
  const { makeFeePurse, runIssuerKit } = setup();
  const feePurse = await makeFeePurse();

  const run1000 = AmountMath.make(runIssuerKit.brand, 1000n);
  const payment = runIssuerKit.mint.mintPayment(run1000);
  feePurse.deposit(payment);

  t.true(AmountMath.isEqual(feePurse.getCurrentAmount(), run1000));

  feePurse.withdraw(run1000);

  t.true(AmountMath.isEmpty(feePurse.getCurrentAmount()));
});

test('assertFeePurse', async t => {
  const { makeFeePurse, assertFeePurse } = setup();
  const feePurse = await makeFeePurse();

  t.notThrows(() => assertFeePurse(feePurse));
  t.notThrows(() => assertFeePurse(Promise.resolve(feePurse)));
});
