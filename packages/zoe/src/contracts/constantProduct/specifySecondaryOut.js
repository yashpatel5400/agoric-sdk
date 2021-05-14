// @ts-check

import { AmountMath } from '@agoric/ertp';

import { calculateFees } from './calcFees';
import { swapOut } from './core';

export const specifySecondaryOut = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So,
  // the poolFee is collected in amountIn which is RUN, and the protocolFee is
  // collected in amountIn, which is RUN

  const { protocolFee, poolFee } = calculateFees(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapOut,
  );

  const allFees = AmountMath.add(protocolFee, poolFee);

  const amountInMinusFees = AmountMath.subtract(swapperAllocation.In, allFees);

  const { amountIn, amountOut } = swapOut(
    { In: amountInMinusFees },
    poolAllocation,
    swapperProposal,
  );

  const userActuallyGives = AmountMath.add(amountIn, allFees);

  const result = {
    protocolFee,
    poolFee,
    swapperGives: userActuallyGives,
    swapperGets: amountOut,
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
