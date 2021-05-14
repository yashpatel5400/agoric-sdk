// @ts-check

import { AmountMath } from '@agoric/ertp';

import { calculateFees } from './calcFees';
import { swapIn } from './core';

export const specifySecondaryIn = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified. So
  // in this case, because the amountIn is specified and that is the
  // secondaryBrand, the pool fee should be collected in runBrand.

  const { protocolFee, poolFee } = calculateFees(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapIn,
  );

  const { amountIn, amountOut } = swapIn(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
  );

  const amountOutMinusFees = AmountMath.subtract(
    AmountMath.subtract(amountOut, protocolFee),
    poolFee,
  );

  const result = {
    protocolFee,
    poolFee,
    swapperGives: amountIn,
    swapperGets: amountOutMinusFees,
    swapperGiveRefund: AmountMath.subtract(swapperAllocation.In, amountIn),
    deltaX: amountIn,
    deltaY: amountOut,
    newX: AmountMath.add(poolAllocation.Secondary, amountIn),
    newY: AmountMath.subtract(poolAllocation.Central, amountOut),
  };

  return result;
};
