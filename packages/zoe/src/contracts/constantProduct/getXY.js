// This does not support secondary to secondary. That has to happen at
// a higher abstraction

/**
 *
 * @param {{ In: Amount }} swapperAllocation
 * @param {{ Central: Amount, Secondary: Amount }} poolAllocation
 * @param {ProposalRecord} swapperProposal
 * @returns {{ x: Amount, y: Amount, deltaX: Amount, wantedDeltaY:
 * Amount }}
 */
export const getXY = (swapperAllocation, poolAllocation, swapperProposal) => {
  // Regardless of whether we are specifying the amountIn or the
  // amountOut, the xBrand is the brand of the amountIn.
  const xBrand = swapperAllocation.In.brand;
  const secondaryBrand = poolAllocation.Secondary.brand;
  const centralBrand = poolAllocation.Central.brand;

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
