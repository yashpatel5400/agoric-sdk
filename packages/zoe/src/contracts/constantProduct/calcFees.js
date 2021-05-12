// @ts-check

import { multiplyByCeilDivide, makeRatio } from '../../contractSupport/ratio';

import { BASIS_POINTS } from './defaults';

import { calcDeltaYSellingX, calcDeltaXSellingX } from './core';

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
 * @param {Amount} amount
 * @param {Ratio} feeRatio
 * @returns {Amount}
 */
const calcFee = (amount, feeRatio) => {
  // always round fees up
  return multiplyByCeilDivide(amount, feeRatio);
};

// SwapIn uses calcDeltaYSellingX
// SwapOut uses calcDeltaXSellingY

const specifyRunInConfig = {
  fn: calcDeltaYSellingX,
  in: runBrand,
  out: secondaryBrand,
  poolFee: secondaryBrand,
};
const specifySecondaryInConfig = {
  fn: calcDeltaYSellingX,
  in: secondaryBrand,
  out: runBrand,
  poolFee: runBrand,
};
const specifyRunOutConfig = {
  fn: calcDeltaXSellingX,
  in: secondaryBrand,
  out: runBrand,
  poolFee: secondaryBrand,
};
const specifySecondaryOutConfig = {
  fn: calcDeltaXSellingX,
  in: runBrand,
  out: secondaryBrand,
  poolFee: runBrand,
};

const calcSwap = ({ fn, x, y, delta }) => {
  return fn(x, y, delta);
};
 
export const calculateFees = (
  runAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeRatio,
  poolFeeRatio,
  config,
) => {
  // Get a rough estimation in both brands of the amount to be swapped
  const estimatedAmount = config.fn(
    // TODO: how to specify which is x and which is y?
    runPoolAllocation,
    secondaryPoolAllocation,
    runAmountIn,
  );

  const protocolFee = calcFee(runAmountIn, protocolFeeRatio);
  const poolFee = calcFee(estimatedAmountOut, poolFeeRatio);

  const fees = harden({ protocolFee, poolFee });
  return fees;
};

export const calculateFeesSpecifySecondaryIn = (
  secondaryAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  const estimatedAmountOut = calcDeltaYSellingX(
    secondaryPoolAllocation,
    runPoolAllocation,
    secondaryAmountIn,
  );

  const protocolFee = calcProtocolFee(estimatedAmountOut, protocolFeeBP);
  const poolFee = calcPoolFee(estimatedAmountOut, poolFeeBP);

  const fees = harden({ protocolFee, poolFee });
  return fees;
};

export const calculateFeesSpecifyRunOut = (
  runAmountOut,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // x is secondary and amountIn, y is run
  const estimatedAmountIn = calcDeltaXSellingX(
    secondaryPoolAllocation,
    runPoolAllocation,
    runAmountOut,
  );

  const protocolFee = calcProtocolFee(runAmountOut, protocolFeeBP);

  // The opposite of what is specified
  const poolFee = calcPoolFee(estimatedAmountIn, poolFeeBP);

  const fees = harden({ protocolFee, poolFee });
  return fees;
};

export const calculateFeesSpecifySecondaryOut = (
  secondaryAmountOut,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // x is run and amountIn, y is secondary
  const estimatedAmountIn = calcDeltaXSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    secondaryAmountOut,
  );

  const protocolFee = calcProtocolFee(estimatedAmountIn, protocolFeeBP);
  const poolFee = calcPoolFee(estimatedAmountIn, poolFeeBP);

  const fees = harden({ protocolFee, poolFee });
  return fees;
};
