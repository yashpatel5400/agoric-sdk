// @ts-check

import { assert, details as X } from '@agoric/assert';
import { amountMath } from '@agoric/ertp';

import { assertRightsConserved } from '../../contractFacet/rightsConservation';
import { calculateFeesSpecifyRunIn } from './calcFees';
import { calcDeltaXSellingX, calcDeltaYSellingX } from './core';
import {
  assertKInvariantSellingX,
  assertPoolFee,
  assertProtocolFee,
} from './invariants';

export const specifyRunIn = (
  runAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // Basic sanity checks
  assert(
    !amountMath.isEmpty(runPoolAllocation),
    X`runPoolAllocation cannot be empty`,
  );
  assert(
    !amountMath.isEmpty(secondaryPoolAllocation),
    X`secondaryPoolAllocation cannot be empty`,
  );
  assert(!amountMath.isEmpty(runAmountIn), X`runAmountIn cannot be empty`);

  // Do we want to ensure this?
  assert(
    amountMath.isGTE(runPoolAllocation, runAmountIn),
    X`runPoolAllocation must be greater than runAmountIn`,
  );

  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So
  // in this case, it should be collected in secondaryBrand since the
  // amountIn is specified.

  const fees = calculateFeesSpecifyRunIn(
    runAmountIn,
    runPoolAllocation,
    secondaryPoolAllocation,
    protocolFeeBP,
    poolFeeBP,
  );
  const { protocolFee } = fees;
  let { poolFee } = fees;

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
  let deltaSecondaryMinusPoolFee;

  // If the poolFee is greater than deltaSecondary, deltaSecondaryMinusPoolFee
  // should be empty, and the poolFee should be the whole of
  // deltaSecondary, whatever that is.
  if (amountMath.isGTE(deltaSecondary, poolFee)) {
    deltaSecondaryMinusPoolFee = amountMath.subtract(deltaSecondary, poolFee);
  } else {
    deltaSecondaryMinusPoolFee = amountMath.makeEmptyFromAmount(deltaSecondary);
    poolFee = deltaSecondary;
  }

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

  // double check invariants
  assertKInvariantSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    result.deltaRun,
    result.deltaSecondary,
  );

  const priorAmounts = [
    runPoolAllocation,
    secondaryPoolAllocation,
    runAmountIn,
  ];
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

  return result;
};
