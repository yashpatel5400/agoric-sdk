// noinspection ES6PreferShortImport
import { makeZoe } from '@agoric/zoe';
import { Far } from '@agoric/marshal';
import { makeAndApplyFeePurse } from '@agoric/zoe/src/applyFeePurse';

export function buildRootObject(_vatPowers, vatParameters) {
  return Far('root', {
    buildZoe: vatAdminSvc => {
      const { zoeService } = makeZoe(vatAdminSvc, vatParameters.zcfBundleName);
      const { zoeService: zoe } = makeAndApplyFeePurse(zoeService);
      return zoe;
    },
  });
}
