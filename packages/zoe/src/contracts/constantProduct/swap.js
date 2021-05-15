// @ts-check

import { AmountMath } from '@agoric/ertp';
import { calculateFees } from './calcFees';

const subtractRelevantFees = (amount, fee) => {
  if (amount.brand === fee.brand) {
    return AmountMath.subtract(amount, fee);
  }
  return amount;
};

const subtractFees = (amount, { poolFee, protocolFee }) => {
  return subtractRelevantFees(
    subtractRelevantFees(amount, protocolFee),
    poolFee,
  );
};

const addRelevantFees = (amount, fee) => {
  if (amount.brand === fee.brand) {
    return AmountMath.add(amount, fee);
  }
  return amount;
};

const addFees = (amount, { poolFee, protocolFee }) => {
  return addRelevantFees(addRelevantFees(amount, protocolFee), poolFee);
};

const addOrSubtractFromPool = (addOrSub, poolAllocation, amount) => {
  if (poolAllocation.Central.brand === amount.brand) {
    return addOrSub(poolAllocation.Central, amount);
  } else {
    return addOrSub(poolAllocation.Secondary, amount);
  }
};

export const swap = (
  swapperAllocation,
  poolAllocation,
  swapperProposal,
  protocolFeeRatio,
  poolFeeRatio,
  swapFn,
) => {
  // The protocol fee must always be collected in RUN, but the pool
  // fee is collected in the amount opposite of what is specified.

  const fees = calculateFees(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
    protocolFeeRatio,
    poolFeeRatio,
    swapFn,
  );

  const amountInMinusFees = subtractFees(swapperAllocation.In, fees);

  const { amountIn, amountOut } = swapFn(
    { In: amountInMinusFees },
    poolAllocation,
    swapperProposal,
  );

  const swapperGives = addFees(amountIn, fees);
  const swapperGets = subtractFees(amountOut, fees);

  const result = {
    protocolFee: fees.protocolFee,
    poolFee: fees.poolFee,
    swapperGives,
    swapperGets,
    swapperGiveRefund: AmountMath.subtract(swapperAllocation.In, swapperGives),
    deltaX: amountIn,
    deltaY: amountOut,
    newX: addOrSubtractFromPool(AmountMath.add, poolAllocation, amountIn),
    newY: addOrSubtractFromPool(AmountMath.subtract, poolAllocation, amountOut),
  };

  return result;
};
