// @ts-check

import { makeCopyTagged } from '@agoric/marshal';

export const M = harden({
  any: () => makeCopyTagged('match:any', undefined),
  style: keyStyle => makeCopyTagged('match:keyStyle', keyStyle),
  and: (...patts) => makeCopyTagged('match:and', patts),
  or: (...patts) => makeCopyTagged('match:or', patts),
  gte: rightSide => makeCopyTagged('match:gte', rightSide),
  lte: rightSide => makeCopyTagged('match:lte', rightSide),
});
