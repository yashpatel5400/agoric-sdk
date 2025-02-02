// @ts-check

import '../../../exported.js';
import './types.js';

import { E } from '@agoric/eventual-send';
import { AmountMath } from '@agoric/ertp';
import { getAmountOut, multiplyBy } from '../../contractSupport/index.js';
import { Position } from './position.js';
import { calculateShares } from './calculateShares.js';

/**
 * makePayoffHandler returns an object with methods that are useful for
 * callSpread contracts.
 *
 * @type {MakePayoffHandler}
 */
function makePayoffHandler(zcf, seatPromiseKits, collateralSeat) {
  const terms = zcf.getTerms();
  const {
    brands: { Strike: strikeBrand, Collateral: collateralBrand },
  } = terms;
  let seatsExited = 0;

  /** @type {MakeOptionInvitation} */
  function makeOptionInvitation(position) {
    return zcf.makeInvitation(
      // All we do at the time of exercise is resolve the promise.
      seat => seatPromiseKits[position].resolve(seat),
      `collect ${position} payout`,
      {
        position,
      },
    );
  }

  function reallocateToSeat(seatPromise, sharePercent) {
    seatPromise.then(seat => {
      const totalCollateral = terms.settlementAmount;
      const seatPortion = multiplyBy(totalCollateral, sharePercent);
      seat.incrementBy(collateralSeat.decrementBy({ Collateral: seatPortion }));
      zcf.reallocate(seat, collateralSeat);
      seat.exit();
      seatsExited += 1;
      const remainder = collateralSeat.getAmountAllocated('Collateral');
      if (AmountMath.isEmpty(remainder, collateralBrand) && seatsExited === 2) {
        zcf.shutdown('contract has been settled');
      }
    });
  }

  function payoffOptions(quoteAmount) {
    const strike1 = terms.strikePrice1;
    const strike2 = terms.strikePrice2;
    const { longShare, shortShare } = calculateShares(
      collateralBrand,
      quoteAmount,
      strike1,
      strike2,
    );
    // either offer might be exercised late, so we pay the two seats separately.
    reallocateToSeat(seatPromiseKits[Position.LONG].promise, longShare);
    reallocateToSeat(seatPromiseKits[Position.SHORT].promise, shortShare);
  }

  function schedulePayoffs() {
    E(terms.priceAuthority)
      .quoteAtTime(terms.expiration, terms.underlyingAmount, strikeBrand)
      .then(priceQuote => payoffOptions(getAmountOut(priceQuote)));
  }

  /** @type {PayoffHandler} */
  const handler = harden({
    schedulePayoffs,
    makeOptionInvitation,
  });
  return handler;
}

harden(makePayoffHandler);
export { makePayoffHandler };
