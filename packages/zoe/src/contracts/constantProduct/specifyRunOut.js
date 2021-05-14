// @ts-check

import { AmountMath } from '@agoric/ertp';

import { calculateFees } from './calcFees';
import { swapOut } from './core';

export const specifyRunOut = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So,
  // the poolFee is collected in amountIn, and the protocolFee is
  // collected in amountOut

  const { protocolFee, poolFee } = calculateFees(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapOut,
  );

  const amountInMinusPoolFee = AmountMath.subtract(
    swapperAllocation.In,
    poolFee,
  );

  const { amountIn, amountOut } = swapOut(
    { In: amountInMinusPoolFee },
    poolAllocation,
    swapperProposal,
  );

  const userActuallyGives = AmountMath.add(amountIn, poolFee);

  const result = {
    protocolFee,
    poolFee,
    swapperGives: userActuallyGives,
    swapperGets: AmountMath.subtract(amountOut, protocolFee),
    swapperGiveRefund: AmountMath.subtract(
      swapperAllocation.In,
      userActuallyGives,
    ),
    deltaX: amountIn,
    deltaY: amountOut,
    newX: AmountMath.add(poolAllocation.Central, amountIn),
    newY: AmountMath.subtract(poolAllocation.Secondary, amountOut),
  };

  return result;
};
