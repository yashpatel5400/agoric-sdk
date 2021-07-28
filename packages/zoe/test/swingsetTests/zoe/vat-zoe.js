// @ts-check

import { Far } from '@agoric/marshal';

// noinspection ES6PreferShortImport
import { makeZoe } from '../../../src/zoeService/zoe';

export function buildRootObject(_vatPowers) {
  return Far('root', {
    buildZoe: vatAdminSvc => {
      // * An empty function: 36560 computrons. This is the base overhead for each message delivery (dispatch.deliver)
      // * Adding `async` to a function (which creates a return Promise): 98
      // * `let i = 1`: 3
      // * `i += 2`: 4
      // * `let sum; for (let i=0; i<100; i++) { sum += i; }`: 1412
      //   * same, but adding to 1000: 14012
      // * defining a `harden()`ed add/read "counter" object: 1475
      //   * invoking `add()`: 19
      // * `console.log('')`: 1011 computrons
      // * ERTP `getBrand()`: 49300
      // * ERTP `getCurrentAmount()`: 54240
      // * ERTP `getUpdateSince()`: 59084
      // * ERTP `deposit()`: 124775
      // * ERTP `withdraw()`: 111141
      // * Zoe `install()`: 62901
      // * ZCF `executeContract()` of the Multi-Pool Autoswap contract: 12.9M
      // * ZCF `executeContract()` (importBundle) of the Treasury
      //   contract: 13.5M

      // These numbers need more data and are currently based roughly
      // the above.
      const expectedComputrons = {
        install: 70_000n,
        startInstance: 50_000_000n,
        offer: 300_000n,
        makePublicFacet: 70_000n,
      };

      return makeZoe(vatAdminSvc, expectedComputrons);
    },
  });
}
