// @ts-check

import { amountMath, makeIssuerKit, MathKind } from '@agoric/ertp';

export const setupMintKits = () => {
  const runKit = makeIssuerKit(
    'RUN',
    MathKind.NAT,
    harden({ decimalPlaces: 6 }),
  );
  const bldKit = makeIssuerKit(
    'BLD',
    MathKind.NAT,
    harden({ decimalPlaces: 6 }),
  );
  const run = value => amountMath.make(runKit.brand, value);
  const bld = value => amountMath.make(bldKit.brand, value);
  return { runKit, bldKit, run, bld };
};
