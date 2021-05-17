// This does not support secondary to secondary. That has to happen at
// a higher abstraction

/**
 *
 * @param {Amount} amountGiven
 * @param {{ Central: Amount, Secondary: Amount }} poolAllocation
 * @param {Amount} amountWanted
 * @returns {{ x: Amount, y: Amount, deltaX: Amount, wantedDeltaY:
 * Amount }}
 */
export const getXY = (amountGiven, poolAllocation, amountWanted) => {
  // Regardless of whether we are specifying the amountIn or the
  // amountOut, the xBrand is the brand of the amountIn.
  const xBrand = amountGiven.brand;
  const secondaryBrand = poolAllocation.Secondary.brand;
  const centralBrand = poolAllocation.Central.brand;

  const deltas = {
    deltaX: amountGiven,
    wantedDeltaY: amountWanted,
  };

  if (secondaryBrand === xBrand) {
    return harden({
      x: poolAllocation.Secondary,
      y: poolAllocation.Central,
      ...deltas,
    });
  }
  if (centralBrand === xBrand) {
    return harden({
      x: poolAllocation.Central,
      y: poolAllocation.Secondary,
      ...deltas,
    });
  }
  assert.fail(`brand ${xBrand} was not recognized as Central or Secondary`);
};
