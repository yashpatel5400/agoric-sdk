// @ts-check

import { multiplyByCeilDivide, makeRatio } from '../../contractSupport/ratio';

import { BASIS_POINTS } from './defaults';

import { calcDeltaYSellingX } from './core';

/**
 * Calculate the protocol fee given a runAmount
 *
 * @param {Amount} runAmount
 * @param {NatValue} protocolFeeBP
 * @returns {Amount} the protocol fee in RUN
 */
export const calcProtocolFee = (runAmount, protocolFeeBP) => {
  const protocolFeeRatio = makeRatio(
    protocolFeeBP,
    runAmount.brand,
    BASIS_POINTS,
  );
  // always round fees up
  return multiplyByCeilDivide(runAmount, protocolFeeRatio);
};

/**
 * Calculate the pool fee given an amount, which may be in RUN or
 * another brand
 *
 * @param {Amount} runOrSecondaryAmount
 * @param {NatValue} poolFeeBP
 * @returns {Amount}
 */
export const calcPoolFee = (runOrSecondaryAmount, poolFeeBP) => {
  const poolFeeRatio = makeRatio(
    poolFeeBP,
    runOrSecondaryAmount.brand,
    BASIS_POINTS,
  );
  // always round fees up
  return multiplyByCeilDivide(runOrSecondaryAmount, poolFeeRatio);
};

export const calculateFeesSpecifyRunIn = (
  runAmountIn,
  runPoolAllocation,
  secondaryPoolAllocation,
  protocolFeeBP,
  poolFeeBP,
) => {
  // Get a rough concept of how much the runAmountIn is worth in the
  // secondary brand, then subtract fees

  const estimatedAmountOut = calcDeltaYSellingX(
    runPoolAllocation,
    secondaryPoolAllocation,
    runAmountIn,
  );

  const protocolFee = calcProtocolFee(runAmountIn, protocolFeeBP);
  const poolFee = calcPoolFee(estimatedAmountOut, poolFeeBP);

  const fees = harden({ protocolFee, poolFee });
  return fees;
};
