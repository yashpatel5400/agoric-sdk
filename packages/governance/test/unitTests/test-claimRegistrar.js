/* global __dirname */

// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava';
import '@agoric/zoe/exported';

import { makeZoe } from '@agoric/zoe';
import bundleSource from '@agoric/bundle-source';
import fakeVatAdmin from '@agoric/zoe/tools/fakeVatAdmin';
import { E } from '@agoric/eventual-send';
import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';
import { makeHandle } from '@agoric/zoe/src/makeHandle';

import buildManualTimer from '@agoric/zoe/tools/manualTimer';
import { Nat } from '@agoric/nat';
import {
  makeBallotSpec,
  ElectionType,
  ChoiceMethod,
  QuorumRule,
} from '../../src/ballotBuilder';

const claimsRegistrarRoot = `${__dirname}/../../src/claimsRegistrar.js`;
const binaryCounterRoot = `${__dirname}/../../src/binaryBallotCounter.js`;

const makeInstall = (sourceRoot, zoe) => {
  const bundle = bundleSource(sourceRoot);
  console.log(`installing ${sourceRoot}`);
  return E.when(bundle, b => E(zoe).install(b));
};

function makeAttestation(handle, amountLiened, addr, expiration) {
  return harden([{ handle, amountLiened, addr, expiration }]);
}

const attest = (addr, amountLiened, expiration) => {
  Nat(amountLiened);
  Nat(expiration);
  const handle = makeHandle('Attestation');
  return makeAttestation(handle, amountLiened, addr, expiration);
};

const makeDefaultBallotSpec = (depose, positions, timer, deadline) => {
  const ballotSpec = makeBallotSpec(
    ChoiceMethod.CHOOSE_N,
    depose,
    positions,
    ElectionType.ELECTION,
    1,
    { timer, deadline },
    QuorumRule.NONE,
    positions[1],
  );
  return ballotSpec;
};

const zoe = makeZoe(fakeVatAdmin);
const registrarInstall = makeInstall(claimsRegistrarRoot, zoe);
const counterInstall = makeInstall(binaryCounterRoot, zoe);

const offerToVoteSeat = (attestationMint, publicRegistrar, attestation) => {
  const attestation1 = attestationMint.mintPayment(attestation);
  const proposal = harden({
    give: { Attestation: attestation },
    want: {},
  });
  return E(zoe).offer(E(publicRegistrar).makeVoteInvitation(), proposal, {
    Attestation: attestation1,
  });
};

const voterFacet = (mint, publicFacet, attest1) => {
  return E(offerToVoteSeat(mint, publicFacet, attest1)).getOfferResult();
};

const addDeposeQuestion = async (timer, creatorFacet) => {
  const depose = { text: 'Replace the CEO?' };
  const deposePositions = [
    harden({ text: 'Yes, replace' }),
    harden({ text: 'no change' }),
  ];
  const deposeSpec = makeDefaultBallotSpec(depose, deposePositions, timer, 2n);
  const { publicFacet: deposeCounter } = await E(creatorFacet).addQuestion(
    counterInstall,
    deposeSpec,
  );
  return { deposePositions, deposeCounter };
};

const addDividendQuestion = async (timer, creatorFacet) => {
  const dividend = { text: 'Raise the dividend?' };
  const divPositions = [
    harden({ text: 'Raise dividend to $0.70' }),
    harden({ text: 'Raise dividend to $0.50' }),
  ];
  const dividendSpec = makeDefaultBallotSpec(dividend, divPositions, timer, 4n);
  const { publicFacet: dividendCounter } = await E(creatorFacet).addQuestion(
    counterInstall,
    dividendSpec,
  );
  return { divPositions, dividendCounter };
};

test('claimsRegistrar attestation returned on simpleInvite', async t => {
  const { issuer, brand, mint } = makeIssuerKit('attestations', AssetKind.SET);

  const { publicFacet: registrarPub } = await E(zoe).startInstance(
    registrarInstall,
    {
      Attestation: issuer,
    },
  );

  const attest1 = AmountMath.make(brand, attest('a', 37n, 5n));
  const voteSeat = offerToVoteSeat(mint, registrarPub, attest1);
  const aPurse = issuer.makeEmptyPurse();
  await aPurse.deposit(await E(voteSeat).getPayout('Attestation'));

  t.deepEqual(await E(aPurse).getCurrentAmount(), attest1);
});

test('claimsRegistrar attestation to vote', async t => {
  const { issuer, brand, mint } = makeIssuerKit('attestations', AssetKind.SET);
  const timer = buildManualTimer(console.log);
  const { publicFacet, creatorFacet } = await E(
    zoe,
  ).startInstance(registrarInstall, { Attestation: issuer });

  const attest1 = AmountMath.make(brand, attest('a', 37n, 5n));
  const voteSeat = voterFacet(mint, publicFacet, attest1);

  const { deposePositions, deposeCounter } = await addDeposeQuestion(
    timer,
    creatorFacet,
  );

  const ballot = await E(deposeCounter).getBallotTemplate();
  const filledOutBallot = E(ballot).choose([deposePositions[1]]);

  await E(voteSeat).castBallot(filledOutBallot);

  await E(timer).tick();
  await E(timer).tick();

  await E.when(E(deposeCounter).getOutcome(), outcome => {
    t.is(outcome, deposePositions[1]);
  }).catch(e => t.fail(e));
});

test('claimsRegistrar reuse across questions', async t => {
  const { issuer, brand, mint } = makeIssuerKit('attestations', AssetKind.SET);
  const timer = buildManualTimer(console.log);
  const { publicFacet, creatorFacet } = await E(
    zoe,
  ).startInstance(registrarInstall, { Attestation: issuer });

  const attest1 = AmountMath.make(brand, attest('a', 37n, 5n));
  const voteFacet1 = voterFacet(mint, publicFacet, attest1);
  const attest2 = AmountMath.make(brand, attest('a', 13n, 6n));
  const voteFacet2 = voterFacet(mint, publicFacet, attest2);
  const { deposePositions, deposeCounter } = await addDeposeQuestion(
    timer,
    creatorFacet,
  );
  const deposeBallot = await E(deposeCounter).getBallotTemplate();

  const { divPositions, dividendCounter } = await addDividendQuestion(
    timer,
    creatorFacet,
  );
  const divBallot = await E(dividendCounter).getBallotTemplate();

  const deposeBallot1 = E(deposeBallot).choose([deposePositions[1]]);
  const divBallot0 = E(divBallot).choose([divPositions[0]]);

  const vote1dep1 = E(voteFacet1).castBallot(deposeBallot1);
  const vote2dep1 = E(voteFacet2).castBallot(deposeBallot1);
  const vote1div0 = E(voteFacet1).castBallot(divBallot0);
  const vote2div0 = E(voteFacet2).castBallot(divBallot0);
  const t1 = E(timer).tick();

  await Promise.all([vote1dep1, vote2dep1, vote1div0, vote2div0, t1]);
  await Promise.all([E(timer).tick(), E(timer).tick(), E(timer).tick()]);

  const deposeOutcome = await E(deposeCounter).getOutcome();
  t.is(deposeOutcome, deposePositions[1]);

  await E(timer).tick();
  const dividendOutcome = await E(dividendCounter).getOutcome();
  t.is(dividendOutcome, divPositions[0]);

  const dividendTally = await E(dividendCounter).getStats();
  t.deepEqual(dividendTally, {
    spoiled: 0n,
    votes: 2,
    results: [
      { position: divPositions[0], total: 50n },
      { position: divPositions[1], total: 0n },
    ],
  });
  const deposeTally = await E(deposeCounter).getStats();
  t.deepEqual(deposeTally, {
    spoiled: 0n,
    votes: 2,
    results: [
      { position: deposePositions[0], total: 0n },
      { position: deposePositions[1], total: 50n },
    ],
  });
});

test('claimsRegistrar expiring attestations', async t => {
  const { issuer, brand, mint } = makeIssuerKit('attestations', AssetKind.SET);
  const timer = buildManualTimer(console.log);
  const { publicFacet, creatorFacet } = await E(
    zoe,
  ).startInstance(registrarInstall, { Attestation: issuer });

  // deadlines:  depose: 2, dividends: 4
  // voter 1 votes won't count; voter 2 can't vote on dividends.
  const attest1 = AmountMath.make(brand, attest('a', 37n, 1n));
  const voteFacet1 = await voterFacet(mint, publicFacet, attest1);
  const attest2 = AmountMath.make(brand, attest('a', 13n, 3n));
  const voteFacet2 = await voterFacet(mint, publicFacet, attest2);
  const attest3 = AmountMath.make(brand, attest('a', 7n, 5n));
  const voteFacet3 = await voterFacet(mint, publicFacet, attest3);

  const { deposePositions, deposeCounter } = await addDeposeQuestion(
    timer,
    creatorFacet,
  );
  const deposeBallot = await E(deposeCounter).getBallotTemplate();

  const { divPositions, dividendCounter } = await addDividendQuestion(
    timer,
    creatorFacet,
  );
  const divBallot = await E(dividendCounter).getBallotTemplate();

  const deposeBallot0 = E(deposeBallot).choose([deposePositions[0]]);
  const deposeBallot1 = E(deposeBallot).choose([deposePositions[1]]);
  const divBallot0 = E(divBallot).choose([divPositions[0]]);
  const divBallot1 = E(divBallot).choose([divPositions[1]]);

  const vote1dep1 = E(voteFacet1).castBallot(deposeBallot1);
  const vote1div0 = E(voteFacet1).castBallot(divBallot0);
  const vote2dep1 = E(voteFacet2).castBallot(deposeBallot1);
  const vote2div0 = E(voteFacet2).castBallot(divBallot0);
  const vote3div1 = E(voteFacet3).castBallot(divBallot1);
  const vote3dep0 = E(voteFacet3).castBallot(deposeBallot0);

  await Promise.all([vote1dep1, vote2dep1, vote1div0, vote2div0]);
  await Promise.all([vote3dep0, vote3div1]);
  await Promise.all([E(timer).tick(), E(timer).tick()]);
  await Promise.all([E(timer).tick(), E(timer).tick()]);

  const deposeOutcome = await E(deposeCounter).getOutcome();
  t.is(deposeOutcome, deposePositions[1]);
  const deposeTally = await E(deposeCounter).getStats();
  t.deepEqual(deposeTally, {
    spoiled: 0n,
    votes: 2,
    results: [
      { position: deposePositions[0], total: 7n },
      { position: deposePositions[1], total: 13n },
    ],
  });

  const dividendOutcome = await E(dividendCounter).getOutcome();
  t.is(dividendOutcome, divPositions[1]);
  const dividendTally = await E(dividendCounter).getStats();
  t.deepEqual(dividendTally, {
    spoiled: 0n,
    votes: 1,
    results: [
      { position: divPositions[0], total: 0n },
      { position: divPositions[1], total: 7n },
    ],
  });
});

test('claimsRegistrar bundle/split attestations', async t => {
  const { issuer, brand, mint } = makeIssuerKit('attestations', AssetKind.SET);
  const timer = buildManualTimer(console.log);
  const { publicFacet, creatorFacet } = await E(
    zoe,
  ).startInstance(registrarInstall, { Attestation: issuer });

  // deadline:  depose: 2
  const handleShared = makeHandle('Attestation');
  const handle4 = makeHandle('Attestation');
  const handle7 = makeHandle('Attestation');
  const claim2 = makeAttestation(handleShared, 2n, 'a', 3n)[0];
  const claim4 = makeAttestation(handle4, 4n, 'a', 7n)[0];
  const claim7 = makeAttestation(handle7, 7n, 'a', 3n)[0];
  const claim7Later = makeAttestation(handle7, 7n, 'a', 10n)[0];
  const claim14 = makeAttestation(handleShared, 14n, 'a', 7n)[0];

  const attest2and4 = AmountMath.make(brand, [claim2, claim4]);
  const voteFacet2and4 = await voterFacet(mint, publicFacet, attest2and4);
  const attest4and7 = AmountMath.make(brand, [claim4, claim7]);
  const voteFacet4and7 = await voterFacet(mint, publicFacet, attest4and7);
  const attestUpdate = AmountMath.make(brand, [claim7Later, claim14]);
  const voteFacetUpdate = await voterFacet(mint, publicFacet, attestUpdate);

  const { deposePositions, deposeCounter } = await addDeposeQuestion(
    timer,
    creatorFacet,
  );
  const deposeBallot = await E(deposeCounter).getBallotTemplate();

  const deposeBallot0 = E(deposeBallot).choose([deposePositions[0]]);
  const deposeBallot1 = E(deposeBallot).choose([deposePositions[1]]);

  await E(voteFacet2and4).castBallot(deposeBallot1);
  await E(voteFacet4and7).castBallot(deposeBallot0);
  await E(voteFacetUpdate).castBallot(deposeBallot1);
  // 2n voted [1], then added capital and voted 14n [1]
  // 4n voted [1] then [0]
  // 7n voted [0] then [1]

  await Promise.all([E(timer).tick(), E(timer).tick()]);

  const deposeOutcome = await E(deposeCounter).getOutcome();
  t.is(deposeOutcome, deposePositions[1]);
  const deposeTally = await E(deposeCounter).getStats();
  t.deepEqual(deposeTally, {
    spoiled: 0n,
    votes: 3,
    results: [
      { position: deposePositions[0], total: 4n },
      { position: deposePositions[1], total: 21n },
    ],
  });
});
