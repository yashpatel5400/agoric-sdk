// @ts-check

import { calcWinner } from './calcWinner';
import { shutdown } from './shutdown';
import { closeAuctionWhen } from './closeAuctionWhen';
import { makeInvitations } from './makeInvitations';

/**
 * @type {ContractStartFn}
 */
const start = zcf => {
  const { creatorInvitation, getSeats } = makeInvitations(zcf);

  const closeAuctionFn = () => {
    const { sellSeat, bidSeats } = getSeats();
    const results = calcWinner(sellSeat, bidSeats);
    shutdown(zcf, results);
  };
  closeAuctionWhen(zcf, closeAuctionFn);

  return harden({ creatorInvitation });
};

export { start };
