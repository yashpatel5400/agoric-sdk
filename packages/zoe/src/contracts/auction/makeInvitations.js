// @ts-check
import { Far } from '@agoric/marshal';

import { assertProposalShape } from '../../contractSupport';
import { assertBidSeat } from './assertBidSeat';

const makeInvitations = zcf => {
  let sellSeat;
  const bidSeats = [];

  const makeBidInvitation = () => {
    /** @type {OfferHandler} */
    const performBid = seat => {
      assertProposalShape(seat, {
        give: { Bid: null },
        want: { Asset: null },
      });
      assertBidSeat(zcf, sellSeat, seat);
      bidSeats.push(seat);
    };

    const customProperties = harden({
      auctionedAssets: sellSeat.getProposal().give.Asset,
      minimumBid: sellSeat.getProposal().want.Ask,
    });

    return zcf.makeInvitation(performBid, 'bid', customProperties);
  };

  const sell = seat => {
    assertProposalShape(seat, {
      give: { Asset: null },
      want: { Ask: null },
      // The auction is not over until the deadline according to the
      // provided timer. The seller cannot exit beforehand.
      exit: { waived: null },
    });
    // Save the seat for when the auction closes.
    sellSeat = seat;

    // The bid invitations can only be sent out after the assets to be
    // auctioned are escrowed.
    return Far('offerResult', { makeBidInvitation });
  };

  const creatorInvitation = zcf.makeInvitation(sell, 'sellAssets');

  const getSeats = () => harden({ sellSeat, bidSeats });

  return harden({ creatorInvitation, getSeats });
};

harden(makeInvitations);
export { makeInvitations };
