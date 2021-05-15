// @ts-check

import { swap } from './swap';
import { swapInNoFees } from './core';

export const swapIn = (
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
    swapInNoFees,
  );
};
