import {
  makePriceAuthorityRegistry,
  makeFakePriceAuthority,
} from '@agoric/zoe/src/contracts/priceAuthority';
import { makeLocalAmountMath } from '@agoric/ertp';

export function buildRootObject(_vatPowers) {
  return harden({
    makePriceAuthority: makePriceAuthorityRegistry,
    async makeFakePriceAuthority(options) {
      const { issuerIn, issuerOut } = options;
      const [mathIn, mathOut] = await Promise.all([
        makeLocalAmountMath(issuerIn),
        makeLocalAmountMath(issuerOut),
      ]);
      return makeFakePriceAuthority({ ...options, mathIn, mathOut });
    },
  });
}
