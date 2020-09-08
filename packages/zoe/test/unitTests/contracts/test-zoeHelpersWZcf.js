// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { E } from '@agoric/eventual-send';
import bundleSource from '@agoric/bundle-source';

// noinspection ES6PreferShortImport
import { makeZoe } from '../../../src/zoeService/zoe';
import { setup } from '../setupBasicMints';
import fakeVatAdmin from './fakeVatAdmin';
import { swap } from '../../../src/contractSupport';
import { assertPayoutAmount } from '../../zoeTestHelpers';

const contractRoot = `${__dirname}/zcfTesterContract`;

test(`zoeHelper with zcf - swap`, async t => {
  const {
    moolaIssuer,
    moola,
    moolaMint,
    simoleanIssuer,
    simoleanMint,
    simoleans,
  } = setup();
  const zoe = makeZoe(fakeVatAdmin);

  // pack the contract
  const bundle = await bundleSource(contractRoot);
  // install the contract
  const installation = await zoe.install(bundle);

  // Alice creates an instance
  const issuerKeywordRecord = harden({
    Pixels: moolaIssuer,
    Money: simoleanIssuer,
  });

  // This contract gives ZCF as the contractFacet for testing purposes
  const { creatorFacet, publicFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );
  /** @type ContractFacet */
  const zcf = creatorFacet;

  const seat1 = await zoe.offer(
    publicFacet.makeInvitationForSeat(),
    harden({ want: { A: moola(3) }, give: { B: simoleans(7) } }),
    { B: simoleanMint.mintPayment(simoleans(7)) },
  );
  const seat2 = await zoe.offer(
    publicFacet.makeInvitationForSeat(),
    harden({ want: { B: simoleans(3) }, give: { A: moola(5) } }),
    { A: moolaMint.mintPayment(moola(5)) },
  );
  const zcfSeat1 = await seat1.getOfferResult();
  const zcfSeat2 = await seat2.getOfferResult();
  const message = await swap(zcf, zcfSeat1, zcfSeat2);
  t.is(
    message,
    'The offer has been accepted. Once the contract has been completed, please check your payout',
  );
  assertPayoutAmount(t, moolaIssuer, await seat1.getPayout('A'), moola(3));
  const seat1PayoutB = await seat1.getPayout('B');
  assertPayoutAmount(t, simoleanIssuer, seat1PayoutB, simoleans(4));
  const seat2PayoutB = await seat2.getPayout('B');
  assertPayoutAmount(t, simoleanIssuer, seat2PayoutB, simoleans(3));
  assertPayoutAmount(t, moolaIssuer, await seat2.getPayout('A'), moola(2));
});

test(`zoeHelper with zcf - swap no match`, async t => {
  const {
    moolaIssuer,
    moola,
    moolaMint,
    simoleanIssuer,
    simoleanMint,
    simoleans,
  } = setup();
  const zoe = makeZoe(fakeVatAdmin);

  // pack the contract
  const bundle = await bundleSource(contractRoot);
  // install the contract
  const installation = await zoe.install(bundle);

  // Alice creates an instance
  const issuerKeywordRecord = harden({
    A: moolaIssuer,
    B: simoleanIssuer,
  });

  // This contract gives ZCF as the contractFacet for testing purposes
  const { creatorFacet, publicFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );
  /** @type ContractFacet */
  const zcf = creatorFacet;

  const seat1 = await zoe.offer(
    publicFacet.makeInvitationForSeat(),
    harden({ want: { A: moola(20) }, give: { B: simoleans(3) } }),
    { B: simoleanMint.mintPayment(simoleans(3)) },
  );
  const seat2 = await zoe.offer(
    publicFacet.makeInvitationForSeat(),
    harden({ want: { B: simoleans(43) }, give: { A: moola(5) } }),
    { A: moolaMint.mintPayment(moola(5)) },
  );
  const zcfSeat1 = await seat1.getOfferResult();
  const zcfSeat2 = await seat2.getOfferResult();
  t.throws(
    () => swap(zcf, zcfSeat1, zcfSeat2),
    {
      message:
        'The trade between left [object Object] and right [object Object] failed. Please check the log for more information',
    },
    'mismatched offers',
  );
  assertPayoutAmount(t, moolaIssuer, await seat1.getPayout('A'), moola(0));
  const seat1PayoutB = await seat1.getPayout('B');
  assertPayoutAmount(t, simoleanIssuer, seat1PayoutB, simoleans(3));
  const seat2PayoutB = await seat2.getPayout('B');
  assertPayoutAmount(t, simoleanIssuer, seat2PayoutB, simoleans(0));
  assertPayoutAmount(t, moolaIssuer, await seat2.getPayout('A'), moola(5));
});
