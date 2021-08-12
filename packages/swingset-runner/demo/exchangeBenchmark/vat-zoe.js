import { makeZoeKit } from '@agoric/zoe';
import { Far } from '@agoric/marshal';
import { makeAndApplyFeePurse } from '@agoric/zoe/src/applyFeePurse.js';

export function buildRootObject(_vatPowers, vatParameters) {
  return Far('root', {
    buildZoe: vatAdminSvc => {
      const { zoeService } = makeZoeKit(
        vatAdminSvc,
        vatParameters.zcfBundleName,
      );
      const { zoeService: zoe } = makeAndApplyFeePurse(zoeService);
      return zoe;
    },
  });
}
