// @ts-check

const shutdown = (
  zcf,
  { sellSeat, winnerSeat, assetPrice, assetAmount, bidSeats },
) => {
  // Everyone else gets a refund so their values remain the same.
  winnerSeat.decrementBy({ Bid: assetPrice });
  sellSeat.incrementBy({ Ask: assetPrice });

  sellSeat.decrementBy({ Asset: assetAmount });
  winnerSeat.incrementBy({ Asset: assetAmount });

  zcf.reallocate(sellSeat, winnerSeat);
  sellSeat.exit();
  bidSeats.forEach(bidSeat => {
    if (!bidSeat.hasExited()) {
      bidSeat.exit();
    }
  });
  zcf.shutdown('Auction closed.');
};
harden(shutdown);
export { shutdown };
