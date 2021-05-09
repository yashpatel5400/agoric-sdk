// @ts-check

import { amountMath } from '@agoric/ertp';

import { makeRatio, multiplyBy } from '../../../src/contractSupport/ratio';

import {
  natSafeMath,
  getInputPrice,
  getOutputPrice,
} from '../../../src/contractSupport';

const BASIS_POINTS = 10000n;
const DEFAULT_POOL_FEE = 24n; // 0.0024 or .24%
const DEFAULT_PROTOCOL_FEE = 6n; // .0006 or .06%

const { add } = natSafeMath;

const getPriceGivenAvailableInput = (
  inputReserve,
  outputReserve,
  inputAmount,
  outputBrand,
  feeBP = DEFAULT_POOL_FEE,
) => {
  const valueOut = getInputPrice(
    inputAmount.value,
    inputReserve.value,
    outputReserve.value,
    feeBP,
  );
  const valueIn = getOutputPrice(
    valueOut,
    inputReserve.value,
    outputReserve.value,
    feeBP,
  );
  return {
    amountOut: amountMath.make(valueOut, outputBrand),
    amountIn: amountMath.make(valueIn, inputAmount.brand),
  };
};

export const getCurrentPrice = (
  runPoolAllocation,
  bldPoolAllocation,
  amountIn,
  protocolFeeBP = DEFAULT_PROTOCOL_FEE,
  poolFeeBP = DEFAULT_POOL_FEE,
) => {
  // we'll subtract the protocol fee from amountIn before sending the
  // remainder to the pool to get a quote. Then we'll add the fee to deltaX
  // before sending out the quote.

  // amountIn will be divided into deltaX (what's added to the pool) and the
  // protocol fee. protocolFee will be protocolFeeRatio * deltaX.
  // Therefore, amountIn = (1 + protocolFeeRatio) * deltaX, and
  // protocolFee =  protocolFeeRatio * amountIn / (1 + protocolFeeRatio).
  const feeOverOnePlusFee = makeRatio(
    protocolFeeBP,
    amountIn.brand,
    add(BASIS_POINTS, protocolFeeBP),
  );
  const protocolFee = multiplyBy(amountIn, feeOverOnePlusFee);
  const poolAmountIn = amountMath.subtract(amountIn, protocolFee);
  const price = getPriceGivenAvailableInput(
    runPoolAllocation,
    bldPoolAllocation,
    poolAmountIn,
    bldPoolAllocation.brand,
    poolFeeBP,
  );
  return {
    amountIn: amountMath.add(price.amountIn, protocolFee),
    amountOut: price.amountOut,
    protocolFee,
  };
};
