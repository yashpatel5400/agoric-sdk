import { E } from '@agoric/eventual-send';

import zcfContractBundle from '../../bundles/bundle-contractFacet';

/**
 * Attenuate the power of vatAdminSvc by restricting it such that only
 * ZCF Vats can be created.
 *
 * @param {VatAdminSvc} vatAdminSvc
 * @param {string=} zcfBundleName
 * @returns {CreateZCFVat}
 */
export const setupCreateZCFVat = (vatAdminSvc, zcfBundleName = undefined) => {
  /** @type {CreateZCFVat} */
  const createZCFVat = async (remaining, threshold) => {
    const meter = await E(vatAdminSvc).createMeter(remaining, threshold);
    // const notifier = E(meter).getNotifier();
    // E(notifier).getUpdateSince();
    // TODO: charge fee and fill meter when threshold is met.
    return typeof zcfBundleName === 'string'
      ? E(vatAdminSvc).createVatByName(zcfBundleName, { meter })
      : E(vatAdminSvc).createVat(zcfContractBundle, { meter });
  };
  return createZCFVat;
};
