// @ts-check

import { E } from '@agoric/eventual-send';
import { Far } from '@agoric/marshal';
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import buildManualTimer from '../../../tools/manualTimer';
import { applyChargeAccount } from '../../../src/useChargeAccount';

const setupBasicMints = () => {
  const all = [
    makeIssuerKit('moola'),
    makeIssuerKit('simoleans'),
    makeIssuerKit('bucks'),
  ];
  const mints = all.map(objs => objs.mint);
  const issuers = all.map(objs => objs.issuer);
  const brands = all.map(objs => objs.brand);

  return harden({
    mints,
    issuers,
    brands,
  });
};

const makeVats = async (
  log,
  vats,
  zoe,
  feeIssuerKit,
  installations,
  startingValues,
) => {
  const timer = buildManualTimer(log);
  const { mints, issuers, brands } = setupBasicMints();
  const makePayments = values =>
    mints.map((mint, i) =>
      mint.mintPayment(AmountMath.make(values[i], brands[i])),
    );
  const [aliceValues, bobValues, carolValues, daveValues] = startingValues;

  const fee100000000 = AmountMath.make(feeIssuerKit.brand, 100_000_000n);

  // Setup Alice
  const aliceFeeCoverage = AmountMath.make(
    feeIssuerKit.brand,
    100_000_000_000_000n,
  );
  const aliceChargeAccount = E(zoe).makeChargeAccount();
  const alicePayment = await E(feeIssuerKit.mint).mintPayment(aliceFeeCoverage);
  await E(aliceChargeAccount).deposit(alicePayment);
  const aliceP = E(vats.alice).build(
    applyChargeAccount(zoe, aliceChargeAccount),
    issuers,
    makePayments(aliceValues),
    installations,
    timer,
  );

  // Setup Bob
  const bobFeeCoverage = AmountMath.make(
    feeIssuerKit.brand,
    100_000_000_000_000n,
  );
  const bobChargeAccount = E(zoe).makeChargeAccount();
  const bobPayment = await E(feeIssuerKit.mint).mintPayment(bobFeeCoverage);
  await E(bobChargeAccount).deposit(bobPayment);
  const bobP = E(vats.bob).build(
    applyChargeAccount(zoe, bobChargeAccount),
    issuers,
    makePayments(bobValues),
    installations,
    timer,
  );

  const result = {
    aliceP,
    bobP,
  };

  if (carolValues) {
    const carolChargeAccount = E(zoe).makeChargeAccount();
    const carolPayment = await E(feeIssuerKit.mint).mintPayment(fee100000000);
    await E(carolChargeAccount).deposit(carolPayment);
    const carolP = E(vats.carol).build(
      applyChargeAccount(zoe, carolChargeAccount),
      issuers,
      makePayments(carolValues),
      installations,
      timer,
    );
    result.carolP = carolP;
  }

  if (daveValues) {
    const daveChargeAccount = E(zoe).makeChargeAccount();
    const davePayment = await E(feeIssuerKit.mint).mintPayment(fee100000000);
    await E(daveChargeAccount).deposit(davePayment);
    const daveP = E(vats.dave).build(
      applyChargeAccount(zoe, daveChargeAccount),
      issuers,
      makePayments(daveValues),
      installations,
      timer,
    );
    result.daveP = daveP;
  }

  log(`=> alice, bob, carol and dave are set up`);
  return harden(result);
};

export function buildRootObject(vatPowers, vatParameters) {
  const { argv, contractBundles: cb } = vatParameters;
  return Far('root', {
    async bootstrap(vats, devices) {
      const vatAdminSvc = await E(vats.vatAdmin).createVatAdminService(
        devices.vatAdmin,
      );
      const { zoeService: zoe, feeIssuerKit } = await E(vats.zoe).buildZoe(
        vatAdminSvc,
      );

      const payment = await E(feeIssuerKit.mint).mintPayment(
        AmountMath.make(feeIssuerKit.brand, 100_000_000n),
      );

      const bootstrapCA = await E(zoe).makeChargeAccount();
      await E(bootstrapCA).deposit(payment);

      const installations = {
        automaticRefund: await E(zoe).install(bootstrapCA, cb.automaticRefund),
        coveredCall: await E(zoe).install(bootstrapCA, cb.coveredCall),
        secondPriceAuction: await E(zoe).install(
          bootstrapCA,
          cb.secondPriceAuction,
        ),
        atomicSwap: await E(zoe).install(bootstrapCA, cb.atomicSwap),
        simpleExchange: await E(zoe).install(bootstrapCA, cb.simpleExchange),
        autoswap: await E(zoe).install(bootstrapCA, cb.autoswap),
        sellItems: await E(zoe).install(bootstrapCA, cb.sellItems),
        mintAndSellNFT: await E(zoe).install(bootstrapCA, cb.mintAndSellNFT),
        otcDesk: await E(zoe).install(bootstrapCA, cb.otcDesk),
      };

      console.log('here!');

      const [testName, startingValues] = argv;

      const { aliceP, bobP, carolP, daveP } = await makeVats(
        vatPowers.testLog,
        vats,
        zoe,
        feeIssuerKit,
        installations,
        startingValues,
      );
      await E(aliceP).startTest(testName, bobP, carolP, daveP);
    },
  });
}
