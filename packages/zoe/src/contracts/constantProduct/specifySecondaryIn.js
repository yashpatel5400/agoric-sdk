// @ts-check

import { assert, details as X } from '@agoric/assert';
import { amountMath } from '@agoric/ertp';

import { calculateFeesSpecifySecondaryIn } from './calcFees';
import { calcDeltaXSellingX, calcDeltaYSellingX } from './core';

export const specifySecondaryIn = (
  secondaryAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So
  // in this case, because the amountIn is specified and that is the
  // secondaryBrand, the pool fee should be collected in runBrand.

  const fees = calculateFeesSpecifySecondaryIn(
    secondaryAmountIn,
    runPoolAllocation,
    secondaryPoolAllocation,
    protocolFeeBP,
    poolFeeBP,
  );
  const { protocolFee, poolFee } = fees;

  // PoolFee is in RUN

  const deltaRun = calcDeltaYSellingX(
    secondaryPoolAllocation,
    runPoolAllocation,
    secondaryAmountIn,
  );

  const deltaSecondary = calcDeltaXSellingX(
    secondaryPoolAllocation,
    runPoolAllocation,
    deltaRun,
  );

  const deltaRun2 = calcDeltaYSellingX(
    secondaryPoolAllocation,
    runPoolAllocation,
    deltaSecondary,
  );

  assert(
    amountMath.isEqual(deltaRun, deltaRun2),
    `We should get the same answer`,
  );

  // TODO: what if fees are greater than deltaRun?
  const deltaRunMinusFees = amountMath.subtract(
    amountMath.subtract(deltaRun, protocolFee),
    poolFee,
  );

  const result = {
    protocolFee,
    poolFee,
    amountIn: deltaSecondary,
    amountOut: deltaRunMinusFees,
    deltaRun,
    deltaSecondary,
    newRunPool: amountMath.add(runPoolAllocation, deltaRun),
    newSecondaryPool: amountMath.subtract(
      secondaryPoolAllocation,
      deltaSecondary,
    ),
    inReturnedToUser: amountMath.subtract(secondaryAmountIn, deltaSecondary),
  };

  // TODO: check invariants

  return result;
};
