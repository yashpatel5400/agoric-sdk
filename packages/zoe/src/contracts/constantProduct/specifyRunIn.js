// @ts-check

import { assert, details as X } from '@agoric/assert';
import { AmountMath, amountMath } from '@agoric/ertp';

import { assertRightsConserved } from '../../contractFacet/rightsConservation';
import { calculateFees } from './calcFees';
import { swapIn } from './core';
import {
  assertKInvariantSellingX,
  assertPoolFee,
  assertProtocolFee,
} from './invariants';

export const specifyRunIn = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified.

  const { protocolFee, poolFee } = calculateFees(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapIn,
  );

  const amountInMinusProtocolFee = AmountMath.subtract(
    swapperAllocation.In,
    protocolFee,
  );

  const { amountIn, amountOut } = swapIn(
    { In: amountInMinusProtocolFee },
    poolAllocation,
    swapperProposal,
  );

  const userActuallyGives = AmountMath.add(amountIn, protocolFee);

  const result = {
    protocolFee,
    poolFee,
    swapperGives: userActuallyGives,
    swapperGets: AmountMath.subtract(amountOut, poolFee),
    swapperGiveRefund: amountMath.subtract(
      swapperAllocation.In,
      userActuallyGives,
    ),
    deltaX: amountIn,
    deltaY: amountOut,
    newX: amountMath.add(poolAllocation.Central, amountIn),
    newY: amountMath.subtract(poolAllocation.Secondary, amountOut),
  };

  return result;
};

const checkAllInvariants = (
  runPoolAllocation,
  secondaryPoolAllocation,
  runAmountIn,
  protocolFeeBP,
  poolFeeBP,
  result,
) => {
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
};
