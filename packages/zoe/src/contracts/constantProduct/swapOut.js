// @ts-check

import { swap } from './swap';
import { swapOutNoFees } from './core';

export const swapOut = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
) => {
  return swap(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapOutNoFees,
  );
};
