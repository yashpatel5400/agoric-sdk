// @ts-check

import { Far } from '@agoric/marshal';

// noinspection ES6PreferShortImport
import { makeZoeKit } from '../../../src/zoeService/zoe.js';
import { makeAndApplyFeePurse } from '../../../src/applyFeePurse.js';

export function buildRootObject(_vatPowers) {
  return Far('root', {
    buildZoe: vatAdminSvc => {
      const { zoeService } = makeZoeKit(vatAdminSvc);
      const { zoeService: zoe } = makeAndApplyFeePurse(zoeService);
      return zoe;
    },
  });
}
