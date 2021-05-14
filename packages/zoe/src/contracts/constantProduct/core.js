// @ts-check

import { assert } from '@agoric/assert';
import { AmountMath } from '@agoric/ertp';

import { natSafeMath } from '../../contractSupport';

import { makeRatioFromAmounts } from '../../contractSupport/ratio';

// TODO: fix this up with more assertions and rename
// Used for multiplying y by a ratio with both numerators and
// denominators of brand x
/**
 * @param {Amount} amount
 * @param {Ratio} ratio
 * @returns {Amount}
 */
const multiplyByOtherBrand = (amount, ratio) => {
  return harden({
    value: natSafeMath.floorDivide(
      natSafeMath.multiply(amount.value, ratio.numerator.value),
      ratio.denominator.value,
    ),
    brand: amount.brand,
  });
};

// TODO: fix this up with more assertions and rename
// Used for multiplying y by a ratio with both numerators and
// denominators of brand x
/**
 * @param {Amount} amount
 * @param {Ratio} ratio
 * @returns {Amount}
 */
const multiplyByOtherBrandCeilDivide = (amount, ratio) => {
  return harden({
    value: natSafeMath.ceilDivide(
      natSafeMath.multiply(amount.value, ratio.numerator.value),
      ratio.denominator.value,
    ),
    brand: amount.brand,
  });
};

/**
 * Calculate deltaY when user is selling brand X. This calculates how much of
 * brand Y to give the user in return.
 *
 * deltaY = (deltaXToX/(1 + deltaXToX))*y
 * Equivalently: (deltaX / (deltaX + x)) * y
 *
 * @param {Amount} x - the amount of Brand X in pool, xPoolAllocation
 * @param {Amount} y - the amount of Brand Y in pool, yPoolAllocation
 * @param {Amount} deltaX - the amount of Brand X to be added
 * @returns {Amount} deltaY - the amount of Brand Y to be taken out
 */
export const calcDeltaYSellingX = (x, y, deltaX) => {
  const deltaXPlusX = amountMath.add(deltaX, x);
  const xRatio = makeRatioFromAmounts(deltaX, deltaXPlusX);
  // Result is an amount in y.brand
  // We would want to err on the side of the pool, so this should be a
  // floorDivide so that less deltaY is given out
  return multiplyByOtherBrand(y, xRatio);
};

/**
 * Calculate deltaX when user is selling brand X. This allows us to give the user a
 * small refund if the amount they will as a payout could have been
 * achieved by a smaller input.
 *
 * deltaX = (deltaYToY/(1 - deltaYToY))*x
 * Equivalently: (deltaY / (y - deltaY )) * x
 *
 * @param {Amount} x - the amount of Brand X in pool, xPoolAllocation
 * @param {Amount} y - the amount of Brand Y in pool, yPoolAllocation
 * @param {Amount} deltaY - the amount of Brand Y to be taken out
 * @returns {Amount} deltaX - the amount of Brand X to be added
 */
export const calcDeltaXSellingX = (x, y, deltaY) => {
  const yMinusDeltaY = AmountMath.subtract(y, deltaY);
  const yRatio = makeRatioFromAmounts(deltaY, yMinusDeltaY);
  // Result is an amount in x.brand
  // We want to err on the side of the pool, so this should be a
  // ceiling divide so that more deltaX is taken
  return multiplyByOtherBrandCeilDivide(x, yRatio);
};

const getXAndY = (swapperAllocation, poolAllocation, swapperProposal) => {
  // Regardless of whether we are specifying the amountIn or the
  // amountOut, the xBrand is the brand of the amountIn.
  const xBrand = swapperAllocation.In.brand;
  const secondaryBrand = poolAllocation.Secondary.brand;

  const deltas = {
    deltaX: swapperAllocation.In,
    wantedDeltaY: swapperProposal.want.Out,
  };

  if (secondaryBrand === xBrand) {
    return harden({
      x: poolAllocation.Secondary,
      y: poolAllocation.Central,
      ...deltas,
    });
  } else {
    return harden({
      y: poolAllocation.Central,
      x: poolAllocation.Secondary,
      ...deltas,
    });
  }
};

const swapIn = (swapperAllocation, poolAllocation, swapperProposal) => {
  const { x, y, deltaX, wantedDeltaY } = getXAndY(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
  );
  const deltaY = calcDeltaYSellingX(x, y, deltaX);
  const reducedDeltaX = calcDeltaXSellingX(x, y, deltaY);

  assert(
    AmountMath.isGTE(wantedDeltaY, deltaY),
    `The amount given ${deltaX} is not enough to produce the wanted amount ${wantedDeltaY}`,
  );

  return harden({
    amountIn: reducedDeltaX,
    amountOut: deltaY,
  });
};

const swapOut = (swapperAllocation, poolAllocation, swapperProposal) => {
  const { x, y, deltaX, wantedDeltaY } = getXAndY(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
  );
  const requiredDeltaX = calcDeltaXSellingX(x, y, wantedDeltaY);
  const improvedDeltaY = calcDeltaYSellingX(x, y, requiredDeltaX);

  assert(
    AmountMath.isGTE(
      deltaX,
      requiredDeltaX,
      `The amount given ${deltaX} is not enough to produce the wanted amount ${wantedDeltaY}`,
    ),
  );

  return harden({
    amountIn: requiredDeltaX,
    amountOut: improvedDeltaY,
  });
};
