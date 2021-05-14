// @ts-check

import { multiplyByCeilDivide, makeRatio } from '../../contractSupport/ratio';

import { BASIS_POINTS } from './defaults';

/**
 * Make a ratio given a nat representing basis points
 *
 * @param {NatValue} feeBP
 * @param {Brand} brandOfFee
 * @returns {Ratio}
 */
const makeFeeRatio = (feeBP, brandOfFee) => {
  return makeRatio(feeBP, brandOfFee, BASIS_POINTS);
};

/**
 * @param {{ amountIn: Amount, amountOut: Amount}} amounts - an array of two amounts in different
 * brands. We must select the amount of the same brand as the feeRatio.
 * @param {Ratio} feeRatio
 * @returns {Amount}
 */
const calcFee = ({ amountIn, amountOut }, feeRatio) => {
  const sameBrandAmount =
    amountIn.brand === feeRatio.numerator.brand ? amountIn : amountOut;
  // Always round fees up
  return multiplyByCeilDivide(sameBrandAmount, feeRatio);
};

// SwapIn uses calcDeltaYSellingX
// SwapOut uses calcDeltaXSellingX

export const calculateFees = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
  swapFn,
) => {
  // Get a rough estimation in both brands of the amount to be swapped
  const estimation = swapFn(swapperAllocation, poolAllocation, swapperProposal);

  const protocolFee = calcFee(estimation, protocolFeeRatio);
  const poolFee = calcFee(estimation, poolFeeRatio);

  return harden({ protocolFee, poolFee });
};
