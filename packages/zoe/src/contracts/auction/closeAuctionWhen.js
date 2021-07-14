import { E } from '@agoric/eventual-send';
import { Far } from '@agoric/marshal';

const closeAuctionWhen = (zcf, closeAuctionFn) => {
  const { timeAuthority, closesAfter } = zcf.getTerms();
  E(timeAuthority)
    .setWakeup(
      closesAfter,
      Far('wakeObj', {
        wake: () => closeAuctionFn(),
      }),
    )
    .catch(err => {
      console.error(
        `Could not schedule the close of the auction at the 'closesAfter' deadline ${closesAfter} using this timer ${timeAuthority}`,
      );
      console.error(err);
      throw err;
    });
};
harden(closeAuctionWhen);
export { closeAuctionWhen };