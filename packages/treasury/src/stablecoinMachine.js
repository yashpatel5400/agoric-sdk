// @ts-check
import { Far } from '@agoric/marshal';

import '@agoric/zoe/exported';
import '@agoric/zoe/src/contracts/exported';

// The StableCoinMachine owns a number of VaultManagers, and a mint for the
// "RUN" stablecoin. This overarching SCM will hold ownershipTokens in the
// individual per-type vaultManagers.
//
// makeAddTypeInvitation is a closely held method that adds a brand new
// collateral type. It specifies the initial exchange rate for that type.
//
// a second closely held method (not implemented yet) would add collateral of a
// type for which there is an existing pool. It gets the current price from the
// pool.
//
// ownershipTokens for vaultManagers entitle holders to distributions, but you
// can't redeem them outright, that would drain the utility from the
// economy.

// Run is minted in the following circumstances:

// 1. To add liquidity to the AMM, based on an "initialPrice" parameter for the
// collateral. -> goes into the AMM
// 2. Minting a RUN payment per user in the bootstrap phase to kick off
// the economy -> goes to bootstrap -> to user
// 3. Opening a loan -> goes to user
// 4. Adjusting the balance of a loan (and taking out more RUN) -> goes
// to user
// 5. Charging all vaults interest

import { E } from '@agoric/eventual-send';
import { assert, details, q } from '@agoric/assert';
import makeStore from '@agoric/store';
import {
  assertProposalShape,
  offerTo,
  getAmountOut,
  getAmountIn,
  withdrawFromSeat,
  depositToSeat,
} from '@agoric/zoe/src/contractSupport';

import {
  multiplyBy,
  makeRatioFromAmounts,
} from '@agoric/zoe/src/contractSupport/ratio';
import { AmountMath, AssetKind } from '@agoric/ertp';
import { makePromiseKit } from '@agoric/promise-kit';
import { makeTracer } from './makeTracer';
import { makeVaultManager } from './vaultManager';
import { makeLiquidationStrategy } from './liquidateMinimum';
import { makeMakeCollectFeesInvitation } from './collectRewardFees';

const trace = makeTracer('ST');

/** @type {ContractStartFn} */
export async function start(zcf) {
  // loanParams has time limits for charging interest
  const {
    autoswapInstall,
    priceAuthority,
    loanParams,
    timerService,
    liquidationInstall,
    bootstrapPaymentValue = 0n,
    initialAmount = 100_000_000_000n,
    issuers: { RUN: runIssuer },
    brands: { RUN: runBrand },
  } = zcf.getTerms();

  const makePseudoRunMint = async () => {
    const runMintPromiseKit = makePromiseKit();

    const { zcfSeat: RUNMintSeat } = zcf.makeEmptySeatKit();

    const mintRUNToSeat = (recipientSeat, amounts) => {
      const payments = Object.fromEntries(
        Object.entries(amounts).map(([keyword, amount]) => {
          return [keyword, E(runMintPromiseKit.promise).mintPayment(amount)];
        }),
      );
      return depositToSeat(zcf, recipientSeat, amounts, payments);
    };

    await mintRUNToSeat(RUNMintSeat, { RUN: initialAmount });

    const mintGains = (toAmountKeywordRecord, toSeat) => {
      Object.entries(toAmountKeywordRecord).forEach(([keyword, amount]) => {
        RUNMintSeat.decrementBy({ RUN: amount });
        toSeat.incrementBy({ [keyword]: amount });
      });

      zcf.reallocate(RUNMintSeat, toSeat);
      return toSeat;
    };

    const burnRUNPayment = paymentP => E(runIssuer).burn(paymentP);
    const burnLosses = (amounts, originSeat) => {
      // returns a promise for a payout (promises for payments)
      const payoutsPromise = withdrawFromSeat(zcf, originSeat, amounts);
      // Get an object that is promises for the payments
      const payoutPs = E.get(payoutsPromise);
      const amountsP = Promise.all(Object.values(payoutPs).map(burnRUNPayment));
      return amountsP;
    };

    const getIssuerRecord = () => {
      return harden({
        issuer: runIssuer,
        brand: runBrand,
        assetKind: AssetKind.NAT,
        displayInfo: {
          assetKind: AssetKind.NAT,
          decimalPlaces: 6n,
        },
      });
    };

    const runMint = harden({
      burnLosses,
      mintGains,
      getIssuerRecord,
    });

    return { runMint, resolveRunMint: runMintPromiseKit.resolve };
  };

  const { runMint, resolveRunMint } = await makePseudoRunMint();

  assert.typeof(
    loanParams.chargingPeriod,
    'bigint',
    details`chargingPeriod (${q(loanParams.chargingPeriod)}) must be a BigInt`,
  );
  assert.typeof(
    loanParams.recordingPeriod,
    'bigint',
    details`recordingPeriod (${q(
      loanParams.recordingPeriod,
    )}) must be a BigInt`,
  );

  const govMint = await zcf.makeZCFMint(
    'Governance',
    undefined,
    harden({ decimalPlaces: 6 }),
  );

  const { brand: govBrand } = govMint.getIssuerRecord();

  // This is a stand-in for a reward pool. For now, it's a place to squirrel
  // away fees so the tests show that the funds have been removed.
  const { zcfSeat: rewardPoolSeat } = zcf.makeEmptySeatKit();

  /**
   * We provide an easy way for the vaultManager and vaults to add rewards to
   * the rewardPoolSeat, without directly exposing the rewardPoolSeat to them.
   *
   * @type {ReallocateReward}
   */
  function reallocateReward(amount, fromSeat, otherSeat = undefined) {
    rewardPoolSeat.incrementBy(
      fromSeat.decrementBy({
        RUN: amount,
      }),
    );
    if (otherSeat !== undefined) {
      zcf.reallocate(rewardPoolSeat, fromSeat, otherSeat);
    } else {
      zcf.reallocate(rewardPoolSeat, fromSeat);
    }
  }

  /** @type {Store<Brand,VaultManager>} */
  const collateralTypes = makeStore(); // Brand -> vaultManager

  const zoe = zcf.getZoeService();

  // we assume the multipool-autoswap is public, so folks can buy/sell
  // through it without our involvement
  // Should it use creatorFacet, creatorInvitation, instance?
  /** @type {{ publicFacet: MultipoolAutoswapPublicFacet, instance: Instance,
   *  creatorFacet: MultipoolAutoswapCreatorFacet }} */
  const {
    publicFacet: autoswapAPI,
    instance: autoswapInstance,
    creatorFacet: autoswapCreatorFacet,
  } = await E(zoe).startInstance(
    autoswapInstall,
    { Central: runIssuer },
    {
      timer: timerService,
      poolFee: loanParams.poolFee,
      protocolFee: loanParams.protocolFee,
    },
  );

  // We process only one offer per collateralType. They must tell us the
  // dollar value of their collateral, and we create that many RUN.
  // collateralKeyword = 'aEth'
  async function makeAddTypeInvitation(
    collateralIssuer,
    collateralKeyword,
    rates,
  ) {
    await zcf.saveIssuer(collateralIssuer, collateralKeyword);
    const collateralBrand = zcf.getBrandForIssuer(collateralIssuer);
    assert(!collateralTypes.has(collateralBrand));

    const { creatorFacet: liquidationFacet } = await E(zoe).startInstance(
      liquidationInstall,
      { RUN: runIssuer },
      { autoswap: autoswapAPI },
    );

    async function addTypeHook(seat) {
      assertProposalShape(seat, {
        give: { Collateral: null },
        want: { Governance: null },
      });
      const {
        give: { Collateral: collateralIn },
        want: { Governance: _govOut }, // ownership of the whole stablecoin machine
      } = seat.getProposal();
      assert(!collateralTypes.has(collateralBrand));
      const runAmount = multiplyBy(collateralIn, rates.initialPrice);
      // arbitrarily, give governance tokens equal to RUN tokens
      const govAmount = AmountMath.make(runAmount.value, govBrand);

      // Create new governance tokens, trade them with the incoming offer for
      // collateral. The offer uses the keywords Collateral and Governance.
      // govSeat stores the collateral as Secondary. We then mint new RUN for
      // govSeat and store them as Central. govSeat then creates a liquidity
      // pool for autoswap, trading in Central and Secondary for governance
      // tokens as Liquidity. These governance tokens are held by govSeat
      const { zcfSeat: govSeat } = zcf.makeEmptySeatKit();
      // TODO this should create the seat for us
      govMint.mintGains({ Governance: govAmount }, govSeat);

      // trade the governance tokens for collateral, putting the
      // collateral on Secondary to be positioned for Autoswap
      seat.incrementBy(govSeat.decrementBy({ Governance: govAmount }));
      seat.decrementBy({ Collateral: collateralIn });
      govSeat.incrementBy({ Secondary: collateralIn });

      zcf.reallocate(govSeat, seat);
      // the collateral is now on the temporary seat

      // once we've done that, we can put both the collateral and the minted
      // RUN into the autoswap, giving us liquidity tokens, which we store

      // mint the new RUN to the Central position on the govSeat
      // so we can setup the autoswap pool
      runMint.mintGains({ Central: runAmount }, govSeat);

      // TODO: check for existing pool, use its price instead of the
      // user-provided 'rate'. Or throw an error if it already exists.
      // `addPool` should combine initial liquidity with pool setup

      const liquidityIssuer = await E(autoswapAPI).addPool(
        collateralIssuer,
        collateralKeyword,
      );
      const { brand: liquidityBrand } = await zcf.saveIssuer(
        liquidityIssuer,
        `${collateralKeyword}_Liquidity`,
      );

      // inject both the collateral and the RUN into the new autoswap, to
      // provide the initial liquidity pool
      const liqProposal = harden({
        give: {
          Secondary: collateralIn,
          Central: runAmount,
        },
        want: { Liquidity: AmountMath.makeEmpty(liquidityBrand) },
      });
      const liqInvitation = E(autoswapAPI).makeAddLiquidityInvitation();

      const { deposited } = await offerTo(
        zcf,
        liqInvitation,
        undefined,
        liqProposal,
        govSeat,
      );

      const depositValue = await deposited;

      // TODO(hibbert): make use of these assets (Liquidity: 19899 Aeth)
      trace('depositValue', depositValue);

      const liquidationStrategy = makeLiquidationStrategy(liquidationFacet);

      // do something with the liquidity we just bought
      const vm = makeVaultManager(
        zcf,
        autoswapAPI,
        runMint,
        collateralBrand,
        priceAuthority,
        rates,
        reallocateReward,
        timerService,
        loanParams,
        liquidationStrategy,
      );
      collateralTypes.init(collateralBrand, vm);
      return vm;
    }

    return zcf.makeInvitation(addTypeHook, 'AddCollateralType');
  }

  /**
   * Make a loan in the vaultManager based on the collateral type.
   */
  function makeLoanInvitation() {
    /**
     * @param {ZCFSeat} seat
     */
    async function makeLoanHook(seat) {
      assertProposalShape(seat, {
        give: { Collateral: null },
        want: { RUN: null },
      });
      const {
        give: { Collateral: collateralAmount },
      } = seat.getProposal();
      const { brand: brandIn } = collateralAmount;
      assert(
        collateralTypes.has(brandIn),
        details`Not a supported collateral type ${brandIn}`,
      );
      /** @type {VaultManager} */
      const mgr = collateralTypes.get(brandIn);
      return mgr.makeLoanKit(seat);
    }

    return zcf.makeInvitation(makeLoanHook, 'MakeLoan');
  }

  zcf.setTestJig(() => ({
    runIssuerRecord: runMint.getIssuerRecord(),
    govIssuerRecord: govMint.getIssuerRecord(),
    autoswap: autoswapAPI,
  }));

  async function getCollaterals() {
    // should be collateralTypes.map((vm, brand) => ({
    return harden(
      Promise.all(
        collateralTypes.entries().map(async ([brand, vm]) => {
          const priceQuote = await vm.getCollateralQuote();
          return {
            brand,
            interestRate: vm.getInterestRate(),
            liquidationMargin: vm.getLiquidationMargin(),
            initialMargin: vm.getInitialMargin(),
            stabilityFee: vm.getLoanFee(),
            marketPrice: makeRatioFromAmounts(
              getAmountOut(priceQuote),
              getAmountIn(priceQuote),
            ),
          };
        }),
      ),
    );
  }

  // Eventually the reward pool will live elsewhere. For now it's here for
  // bookkeeping. It's needed in tests.
  function getRewardAllocation() {
    return rewardPoolSeat.getCurrentAllocation();
  }

  function mintBootstrapPayment() {
    const {
      zcfSeat: bootstrapZCFSeat,
      userSeat: bootstrapUserSeat,
    } = zcf.makeEmptySeatKit();
    runMint.mintGains(
      {
        Bootstrap: AmountMath.make(runBrand, bootstrapPaymentValue),
      },
      bootstrapZCFSeat,
    );
    bootstrapZCFSeat.exit();
    const bootstrapPayment = E(bootstrapUserSeat).getPayout('Bootstrap');

    function getBootstrapPayment() {
      return bootstrapPayment;
    }
    return getBootstrapPayment;
  }

  const getBootstrapPayment = mintBootstrapPayment();

  const publicFacet = Far('stablecoin public facet', {
    getAMM() {
      return autoswapInstance;
    },
    makeLoanInvitation,
    getCollaterals,
    // TODO this is in the terms, so could be retrieved from there.
    // This API is here to consider for usability/discoverability
    getRunIssuer() {
      return runIssuer;
    },
  });

  const { makeCollectFeesInvitation } = makeMakeCollectFeesInvitation(
    zcf,
    rewardPoolSeat,
    autoswapCreatorFacet,
    runBrand,
  );

  /** @type {StablecoinMachine} */
  const stablecoinMachine = Far('stablecoin machine', {
    makeAddTypeInvitation,
    getAMM() {
      return autoswapInstance;
    },
    getCollaterals,
    getRewardAllocation,
    getBootstrapPayment,
    makeCollectFeesInvitation,
    resolveRunMint,
  });

  return harden({ creatorFacet: stablecoinMachine, publicFacet });
}
