// @ts-check

import { Far } from '@agoric/marshal';

import { makeZoe } from '@agoric/zoe';
import { makeAndApplyFeePurse } from '@agoric/zoe/src/applyFeePurse.js';

export function buildRootObject(_vatPowers) {
  return Far('root', {
    buildZoe: vatAdminSvc => {
      const { zoeService } = makeZoe(vatAdminSvc);
      const { zoeService: zoe } = makeAndApplyFeePurse(zoeService);
      return zoe;
    },
  });
}
