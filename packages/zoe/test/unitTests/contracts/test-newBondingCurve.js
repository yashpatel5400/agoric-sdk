// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { assert, details as X } from '@agoric/assert';
import { amountMath, makeIssuerKit, MathKind } from '@agoric/ertp';
import { assertRightsConserved } from '../../../src/contractFacet/rightsConservation';

import { assertAmountsEqual } from '../../zoeTestHelpers';

import {
  multiplyByCeilDivide,
  makeRatio,
  addRatios,
  subtractRatios,
  makeRatioFromAmounts,
  divideRatios,
  addRatiosSameDenom,
} from '../../../src/contractSupport/ratio';

import { natSafeMath } from '../../../src/contractSupport';

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
 * @returns
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
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So
  // in this case, it should be collected in secondaryBrand since the
  // amountIn is specified.

  const protocolFee = calcProtocolFee(runAmountIn, protocolFeeBP);

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
  const poolFee = calcPoolFee(deltaSecondary, poolFeeBP);
  const deltaSecondaryMinusPoolFee = amountMath.subtract(
    deltaSecondary,
    poolFee,
  );

  const result = {
    protocolFee,
    poolFee,
    amountIn: amountInMinusProtocolFee,
    amountOut: deltaSecondaryMinusPoolFee,
    deltaRun,
    deltaSecondary,
    newRunPool: amountMath.add(runPoolAllocation, deltaRun),
    newSecondaryPool: amountMath.subtract(
      secondaryPoolAllocation,
      deltaSecondary,
    ),
    inReturnedToUser: amountMath.subtract(amountInMinusProtocolFee, deltaRun),
  };
  return result;
};

const assertProtocolFee = (protocolFee, amountIn, protocolFeeBP) => {
  // protocolFee as a percent of amountIn + protocolFee

  const protocolFeeRatio = makeRatioFromAmounts(
    protocolFee,
    amountMath.add(amountIn, protocolFee),
  );

  const atLeastRatio = makeRatio(protocolFeeBP, amountIn.brand, BASIS_POINTS);

  // Assert that the actual fee charged is greater than or equal to the expected
  // fee charge
  // This will throw if the actual protocolFee was less than the
  // expected protocolFee
  subtractRatios(protocolFeeRatio, atLeastRatio);
};

const assertPoolFee = (poolFee, amountOut, poolFeeBP) => {
  // poolFee as a percent of amountOut + poolee

  const poolFeeRatio = makeRatioFromAmounts(
    poolFee,
    amountMath.add(amountOut, poolFee),
  );

  const atLeastRatio = makeRatio(poolFeeBP, amountOut.brand, BASIS_POINTS);

  // Assert that the actual fee charged is greater than or equal to the expected
  // fee charge
  // This will throw if the actual protocolFee was less than the
  // expected protocolFee
  subtractRatios(poolFeeRatio, atLeastRatio);
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

test('test bug scenario new', async t => {
  const mintKits = setupMintKits();
  const { run, bld } = mintKits;
  const bldPoolAllocationValue = 2196247730468n;
  const runPoolAllocationValue = 50825056949339n;
  const runValueIn = 73000000n;

  const expected = {
    protocolFee: run(43800n),
    poolFee: bld(7567n),
    amountIn: run(72956200n),
    amountOut: bld(3145005n),
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
    amountIn: run(5835n),
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
