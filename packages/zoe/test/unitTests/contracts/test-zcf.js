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

const contractRoot = `${__dirname}/zcfTesterContract`;

test(`zoe - zcfSeat.kickOut() doesn't throw`, async t => {
  const { moolaIssuer, simoleanIssuer } = setup();
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

  const { creatorFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );

  // This contract gives ZCF as the contractFacet for testing purposes
  /** @type ContractFacet */
  const zcf = creatorFacet;

  let firstSeat;

  const grabSeat = seat => {
    firstSeat = seat;
    return 'ok';
  };

  const kickOutSeat = secondSeat => {
    firstSeat.kickOut(new Error('kicked out first'));
    throw secondSeat.kickOut(new Error('kicked out second'));
  };

  const invitation1 = await zcf.makeInvitation(grabSeat, 'seat1');
  const invitation2 = await zcf.makeInvitation(kickOutSeat, 'seat2');

  const userSeat1 = await E(zoe).offer(invitation1);
  const userSeat2 = await E(zoe).offer(invitation2);

  t.is(await E(userSeat1).getOfferResult(), 'ok', `userSeat1 offer result`);

  t.deepEqual(await E(userSeat2).getPayouts(), {});

  await t.throwsAsync(E(userSeat2).getOfferResult());
  await t.throwsAsync(() => E(userSeat1).tryExit(), {
    message: 'seat has been exited',
  });
});

test(`zoe+zcf - consistent issuers w/saveIssuer`, async t => {
  const { moolaIssuer, moolaR, simoleanIssuer, simoleanR } = setup();
  const zoe = makeZoe(fakeVatAdmin);

  // pack the contract
  const bundle = await bundleSource(contractRoot);
  // install the contract
  const installation = await zoe.install(bundle);

  // Alice creates an instance
  const issuerKeywordRecord = harden({ A: moolaIssuer });

  // This contract gives ZCF as the contractFacet for testing purposes
  const { creatorFacet, instance } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );
  /** @type ContractFacet */
  const zcf = creatorFacet;

  t.is(
    zcf.getIssuerForBrand(moolaR.brand),
    await E.G(E(zoe).getIssuers(instance)).A,
  );
  const issuerRecord = zcf.saveIssuer(simoleanIssuer, 'Sim');
  t.throws(() => zcf.getIssuerForBrand(simoleanR.brand), {
    message: '"brand" not found: (an object)\nSee console for error data.',
  });
  await issuerRecord;
  t.is(
    zcf.getIssuerForBrand(simoleanR.brand),
    await E.G(E(zoe).getIssuers(instance)).Sim,
  );
});

test(`zoe+zcf - consistent issuers with makeZcfMint`, async t => {
  const { moolaIssuer, moolaR } = setup();
  const zoe = makeZoe(fakeVatAdmin);

  // pack the contract
  const bundle = await bundleSource(contractRoot);
  // install the contract
  const installation = await zoe.install(bundle);

  // Alice creates an instance
  const issuerKeywordRecord = harden({ A: moolaIssuer });

  // This contract gives ZCF as the contractFacet for testing purposes
  const { creatorFacet, instance } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );
  /** @type ContractFacet */
  const zcf = creatorFacet;

  t.is(zcf.getIssuerForBrand(moolaR.brand), zoe.getIssuers(instance).A);

  const bMint = await zcf.makeZCFMint('Bullion');
  const issuerRecord = await E(bMint).getIssuerRecord();
  t.is(await E.G(E(zoe).getIssuers(instance)).Bullion, issuerRecord.issuer);
});
