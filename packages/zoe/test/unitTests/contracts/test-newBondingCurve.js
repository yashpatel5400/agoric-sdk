// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import jsc from 'jsverify';

import { Nat } from '@agoric/nat';

import { assert, details as X } from '@agoric/assert';
import { amountMath, makeIssuerKit, MathKind } from '@agoric/ertp';
import { assertRightsConserved } from '../../../src/contractFacet/rightsConservation';

import { assertAmountsEqual } from '../../zoeTestHelpers';

import {
  multiplyByCeilDivide,
  makeRatio,
  makeRatioFromAmounts,
} from '../../../src/contractSupport/ratio';

import { natSafeMath } from '../../../src/contractSupport';
import { getCurrentPrice } from './fixedNewSwap';

const BASIS_POINTS = 10000n;
const DEFAULT_POOL_FEE = 24n; // 0.0024 or .24%
const DEFAULT_PROTOCOL_FEE = 6n; // .0006 or .06%

// Used for multiplying y by a ratio with both numerators and
// denominators of brand x
const multiplyByOtherBrand = (amount, ratio) => {
  return harden({
    value: natSafeMath.floorDivide(
      natSafeMath.multiply(amount.value, ratio.numerator.value),
      ratio.denominator.value,
    ),
    brand: amount.brand,
  });
};

// Used for multiplying y by a ratio with both numerators and
// denominators of brand x
const multiplyByOtherBrandCeilDivide = (amount, ratio) => {
  return harden({
    value: natSafeMath.ceilDivide(
      natSafeMath.multiply(amount.value, ratio.numerator.value),
      ratio.denominator.value,
    ),
    brand: amount.brand,
  });
};

/**
 * Calculate the protocol fee given a runAmount
 *
 * @param {Amount} runAmount
 * @param {NatValue} protocolFeeBP
 * @returns {Amount} the protocol fee in RUN
 */
const calcProtocolFee = (runAmount, protocolFeeBP) => {
  const protocolFeeRatio = makeRatio(
    protocolFeeBP,
    runAmount.brand,
    BASIS_POINTS,
  );
  // always round fees up
  return multiplyByCeilDivide(runAmount, protocolFeeRatio);
};

/**
 * @param {Amount} runOrSecondaryAmount
 * @param {NatValue} poolFeeBP
 * @returns {Amount}
 */
const calcPoolFee = (runOrSecondaryAmount, poolFeeBP) => {
  const poolFeeRatio = makeRatio(
    poolFeeBP,
    runOrSecondaryAmount.brand,
    BASIS_POINTS,
  );
  // always round fees up
  return multiplyByCeilDivide(runOrSecondaryAmount, poolFeeRatio);
};

// deltaY = (deltaXToX/(1 + deltaXToX))*y
const calcDeltaYSellingX = (x, y, deltaX) => {
  const deltaXPlusX = amountMath.add(deltaX, x);
  const xRatio = makeRatioFromAmounts(deltaX, deltaXPlusX);
  // Result is an amount in y.brand
  // We would want to err on the side of the pool, so this should be a
  // floorDivide
  return multiplyByOtherBrand(y, xRatio);

  // deltaX / (deltaX + x) * y
};

// deltaX = (deltaYToY/(1 - deltaYToY))*x
const calcDeltaXSellingX = (x, y, deltaY) => {
  const yMinusDeltaY = amountMath.subtract(y, deltaY);
  const yRatio = makeRatioFromAmounts(deltaY, yMinusDeltaY);
  // Result is an amount in x.brand
  // We want to err on the side of the pool, so this should be a
  // ceiling divide
  return multiplyByOtherBrandCeilDivide(x, yRatio);
  // deltaY / (y - deltaY ) * x
};

const calculateFeesSpecifyRunIn = (
  runAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // Get a rough concept of how much the runAmountIn is worth in the
  // secondary brand, then subtract fees

  const estimatedAmountOut = calcDeltaYSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    runAmountIn,
  );

  const protocolFee = calcProtocolFee(runAmountIn, protocolFeeBP);
  const poolFee = calcPoolFee(estimatedAmountOut, poolFeeBP);

  const fees = harden({ protocolFee, poolFee });
  console.log(fees);
  return fees;
};

// xy <= (x + deltaX)(y - deltaY)
const assertKInvariantSellingX = (x, y, deltaX, deltaY) => {
  const oldK = natSafeMath.multiply(x.value, y.value);
  const newX = amountMath.add(x, deltaX);
  const newY = amountMath.subtract(y, deltaY);
  const newK = natSafeMath.multiply(newX.value, newY.value);
  assert(
    oldK <= newK,
    X`the constant product invariant was violated, with x=${x}, y=${y}, deltaX=${deltaX}, deltaY=${deltaY}, oldK=${oldK}, newK=${newK}`,
  );
};

const specifyRunIn = (
  runAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  assert(!amountMath.isEmpty(runPoolAllocation));
  assert(!amountMath.isEmpty(secondaryPoolAllocation));

  assert(amountMath.isGTE(runPoolAllocation, runAmountIn));

  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So
  // in this case, it should be collected in secondaryBrand since the
  // amountIn is specified.

  const { protocolFee, poolFee } = calculateFeesSpecifyRunIn(
    runAmountIn,
    runPoolAllocation,
    secondaryPoolAllocation,
    protocolFeeBP,
    poolFeeBP,
  );

  const amountInMinusProtocolFee = amountMath.subtract(
    runAmountIn,
    protocolFee,
  );

  const deltaSecondary = calcDeltaYSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    amountInMinusProtocolFee,
  );

  const deltaRun = calcDeltaXSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    deltaSecondary,
  );

  const deltaSecondary2 = calcDeltaYSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    deltaRun,
  );

  assert(
    amountMath.isEqual(deltaSecondary, deltaSecondary2),
    `We should get the same answer`,
  );

  // We will take the pool fee explicitly from deltaSecondary, what the user is
  // getting back
  const deltaSecondaryMinusPoolFee = amountMath.subtract(
    deltaSecondary,
    poolFee,
  );

  const userActuallyGives = amountMath.add(deltaRun, protocolFee);

  const result = {
    protocolFee,
    poolFee,
    amountIn: userActuallyGives,
    amountOut: deltaSecondaryMinusPoolFee,
    deltaRun,
    deltaSecondary,
    newRunPool: amountMath.add(runPoolAllocation, deltaRun),
    newSecondaryPool: amountMath.subtract(
      secondaryPoolAllocation,
      deltaSecondary,
    ),
    inReturnedToUser: amountMath.subtract(runAmountIn, userActuallyGives),
  };
  return result;
};

const assertProtocolFee = (protocolFee, amountIn, protocolFeeBP) => {
  // protocolFee as a percent of amountIn + protocolFee

  const protocolFeeRatio = makeRatioFromAmounts(protocolFee, amountIn);

  const approximationBP =
    (Number(protocolFeeRatio.numerator.value) * 10000) /
    Number(protocolFeeRatio.denominator.value);

  console.log('actualProtocolFeeBP', approximationBP);
  assert(
    approximationBP >= protocolFeeBP,
    X`actualProtocolFeeBP was not greater: ${protocolFeeRatio}`,
  );
};

const assertPoolFee = (poolFee, amountOut, poolFeeBP) => {
  // poolFee as a percent of amountOut + poolFee

  const poolFeeRatio = makeRatioFromAmounts(
    poolFee,
    amountMath.add(amountOut, poolFee),
  );

  const approximationBP =
    (Number(poolFeeRatio.numerator.value) * 10000) /
    Number(poolFeeRatio.denominator.value);

  console.log('actualPoolFeeBP', approximationBP);
  assert(approximationBP >= poolFeeBP);
};

const setupMintKits = () => {
  const runKit = makeIssuerKit(
    'RUN',
    MathKind.NAT,
    harden({ decimalPlaces: 6 }),
  );
  const bldKit = makeIssuerKit(
    'BLD',
    MathKind.NAT,
    harden({ decimalPlaces: 6 }),
  );
  const run = value => amountMath.make(runKit.brand, value);
  const bld = value => amountMath.make(bldKit.brand, value);
  return { runKit, bldKit, run, bld };
};

const conductTestSpecifyRunIn = (
  mintKits,
  runPoolAllocationValue,
  bldPoolAllocationValue,
  runValueIn,
  expected,
  t,
  protocolFeeBP = DEFAULT_PROTOCOL_FEE,
  poolFeeBP = DEFAULT_POOL_FEE,
) => {
  const { runKit, bldKit } = mintKits;

  const bldPoolAllocation = amountMath.make(
    bldKit.brand,
    bldPoolAllocationValue,
  );
  const runPoolAllocation = amountMath.make(
    runKit.brand,
    runPoolAllocationValue,
  );

  const runAmountIn = amountMath.make(runKit.brand, runValueIn);

  const result = specifyRunIn(
    runAmountIn,
    runPoolAllocation,
    bldPoolAllocation,
    protocolFeeBP,
    poolFeeBP,
  );

  Object.entries(expected).forEach(([property, amount]) => {
    assertAmountsEqual(t, result[property], amount, property);
  });

  assertKInvariantSellingX(
    runPoolAllocation,
    bldPoolAllocation,
    result.deltaRun,
    result.deltaSecondary,
  );

  const priorAmounts = [runPoolAllocation, bldPoolAllocation, runAmountIn];
  const newAmounts = [
    result.newRunPool,
    result.protocolFee,
    result.newSecondaryPool,
    result.amountOut,
    result.poolFee,
    result.inReturnedToUser,
  ];

  assertRightsConserved(priorAmounts, newAmounts);

  assertProtocolFee(result.protocolFee, result.amountIn, protocolFeeBP);
  assertPoolFee(result.poolFee, result.amountOut, poolFeeBP);
};

test('test bug scenario', async t => {
  const mintKits = setupMintKits();
  const { run, bld } = mintKits;
  const bldPoolAllocationValue = 2196247730468n;
  const runPoolAllocationValue = 50825056949339n;
  const runValueIn = 73000000n;

  const expected = {
    protocolFee: run(43800n),
    poolFee: bld(7571n),
    amountIn: run(72999997n), // buggy newswap quotes 72999951n
    amountOut: bld(3145001n), // buggy newswap quotes 3145005n
    deltaRun: run(72956197n),
    deltaSecondary: bld(3152572n),
    newRunPool: run(50825129905536n),
    newSecondaryPool: bld(2196244577896n),
    inReturnedToUser: run(3n),
  };

  conductTestSpecifyRunIn(
    mintKits,
    runPoolAllocationValue,
    bldPoolAllocationValue,
    runValueIn,
    expected,
    t,
  );
});

test('test small values', async t => {
  const mintKits = setupMintKits();
  const { run, bld } = mintKits;
  const bldPoolAllocationValue = 40000n;
  const runPoolAllocationValue = 500000n;
  const runValueIn = 5839n;

  const expected = {
    protocolFee: run(4n),
    poolFee: bld(2n),
    amountIn: run(5834n),
    amountOut: bld(459n),
    deltaRun: run(5830n),
    deltaSecondary: bld(461n),
    newRunPool: run(505830n),
    newSecondaryPool: bld(39539n),
    inReturnedToUser: run(5n),
  };

  conductTestSpecifyRunIn(
    mintKits,
    runPoolAllocationValue,
    bldPoolAllocationValue,
    runValueIn,
    expected,
    t,
  );
});

test('test bug scenario against fixed newSwap', async t => {
  const mintKits = setupMintKits();
  const { run, bld } = mintKits;
  const bldPoolAllocationValue = 2196247730468n;
  const runPoolAllocationValue = 50825056949339n;
  const runValueIn = 73000000n;

  const expected = {
    protocolFee: run(43800n),
    poolFee: bld(7567n), // 7566
    amountIn: run(72999997n), // buggy newswap quotes 72999951n
    amountOut: bld(3145005n), // buggy newswap quotes 3145005n - the same
    deltaRun: run(72956197n),
    deltaSecondary: bld(3152572n),
    newRunPool: run(50825129905536n),
    newSecondaryPool: bld(2196244577896n),
    inReturnedToUser: run(3n),
  };

  const { amountIn, amountOut, protocolFee } = getCurrentPrice(
    run(runPoolAllocationValue),
    bld(bldPoolAllocationValue),
    run(runValueIn),
    DEFAULT_PROTOCOL_FEE,
    DEFAULT_POOL_FEE,
  );

  // amountIn: run(72999997n) - amountIn is the same
  // amountOut: bld(3145007n) - amount out is higher
  // protocolFee: run(43773n) - protocolFee is less

  const runPoolAllocation = run(runPoolAllocationValue);
  const bldPoolAllocation = bld(bldPoolAllocationValue);
  const deltaX = amountMath.subtract(amountIn, protocolFee);

  // This includes the pool fee so it's only checking that including
  // the pool fee, k is increasing.
  assertKInvariantSellingX(
    run(runPoolAllocationValue),
    bld(bldPoolAllocationValue),
    amountMath.subtract(amountIn, protocolFee),
    amountOut,
  );

  const deltaY = calcDeltaYSellingX(
    runPoolAllocation,
    bldPoolAllocation,
    deltaX,
  );

  const poolFee = amountMath.subtract(deltaY, amountOut);

  console.log('poolFee', poolFee);

  // This is violated: 5.996 BP not 6
  // assertProtocolFee(protocolFee, amountIn, DEFAULT_PROTOCOL_FEE);

  // This is violated 23.999444263463527 not 24
  // assertPoolFee(poolFee, amountOut, DEFAULT_POOL_FEE);
});

test('jsverify constant product', t => {
  const { bld, run } = setupMintKits();
  const constantProduct = jsc.forall(
    'nat',
    'nat',
    'nat',
    (runValueInNat, runPoolAllocationNat, secondaryPoolAllocationNat) => {
      const runValueIn = Nat(runValueInNat);
      const runPoolAllocationValue = Nat(runPoolAllocationNat);
      const secondaryPoolAllocationValue = Nat(secondaryPoolAllocationNat);

      const oldK = runPoolAllocationValue * secondaryPoolAllocationValue;

      const runAmountIn = run(runValueIn);
      const runPoolAllocation = run(runPoolAllocationValue);
      const bldPoolAllocation = bld(secondaryPoolAllocationValue);

      const result = specifyRunIn(
        runAmountIn,
        runPoolAllocation,
        bldPoolAllocation,
        DEFAULT_PROTOCOL_FEE,
        DEFAULT_POOL_FEE,
      );

      const newX = amountMath.add(result.newRunPool, result.deltaRun);
      const newY = amountMath.subtract(
        result.newSecondaryPool,
        result.deltaSecondary,
      );
      const newK = natSafeMath.multiply(newX.value, newY.value);

      return oldK >= newK;
    },
  );

  t.true(jsc.check(constantProduct));
});
