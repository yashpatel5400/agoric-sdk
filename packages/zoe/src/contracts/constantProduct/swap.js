// @ts-check

import { assert, details as X } from '@agoric/assert';
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

const assertGreaterThanZeroHelper = (amount, name) => {
  assert(
    !AmountMath.isGTE(AmountMath.makeEmptyFromAmount(amount), amount),
    X`${name} was not greater than 0: ${amount}`,
  );
};

const assertWantedAvailable = (poolAllocation, swapperProposal) => {
  if (swapperProposal.want.Out.brand === poolAllocation.Central.brand) {
    assert(
      AmountMath.isGTE(poolAllocation.Central, swapperProposal.want.Out),
      X`The poolAllocation ${poolAllocation.Central} did not have enough to satisfy the wanted amountOut ${swapperProposal.want.Out}`,
    );
  } else {
    assert(
      !AmountMath.isGTE(swapperProposal.want.Out, poolAllocation.Secondary),
      X`The poolAllocation ${poolAllocation.Secondary} did not have enough to satisfy the wanted amountOut ${swapperProposal.want.Out}`,
    );
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
  assertGreaterThanZeroHelper(poolAllocation.Central, 'poolAllocation.Central');
  assertGreaterThanZeroHelper(
    poolAllocation.Secondary,
    'poolAllocation.Secondary',
  );
  assertGreaterThanZeroHelper(swapperAllocation.In, 'allocation.In');
  assertGreaterThanZeroHelper(swapperProposal.want.Out, 'proposal.want.Out');
  assertWantedAvailable(poolAllocation, swapperProposal);

  console.log('swapperAllocation', swapperAllocation);
  console.log('poolAllocation', poolAllocation);
  console.log('swapperProposal', swapperProposal);
  // console.log('protocolFeeRatio', protocolFeeRatio);
  // console.log('poolFeeRatio', poolFeeRatio);

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

  console.log(fees);

  const amountInMinusFees = subtractFees(swapperAllocation.In, fees);

  const { amountIn, amountOut } = swapFn(
    { In: amountInMinusFees },
    poolAllocation,
    swapperProposal,
  );

  console.log('amountIn', amountIn);
  console.log('amountOut', amountOut);

  const swapperGives = addFees(amountIn, fees);

  console.log('swapperGives', swapperGives);
  const swapperGets = subtractFees(amountOut, fees);

  assert(
    AmountMath.isGTE(swapperAllocation.In, swapperGives),
    X`The amount provided ${swapperAllocation.In} is not enough. ${swapperGives} is required.`,
  );

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

  console.log(result);

  return result;
};
