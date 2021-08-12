// @ts-check

import { makeWeakStore } from '@agoric/store';

export const makeInstanceAdminStorage = (
  chargeZoeFee,
  getPublicFacetFeeAmount,
) => {
  /** @type {WeakStore<Instance,InstanceAdmin>} */
  const instanceToInstanceAdmin = makeWeakStore('instance');

  /** @type {GetPublicFacet} */
  const getPublicFacet = async (feePurse, instance) => {
    await chargeZoeFee(feePurse, getPublicFacetFeeAmount);
    return instanceToInstanceAdmin.get(instance).getPublicFacet();
  };

  /** @type {GetBrands} */
  const getBrands = async instance =>
    instanceToInstanceAdmin.get(instance).getBrands();

  /** @type {GetIssuers} */
  const getIssuers = async instance =>
    instanceToInstanceAdmin.get(instance).getIssuers();

  /** @type {GetTerms} */
  const getTerms = instance => instanceToInstanceAdmin.get(instance).getTerms();

  /** @type {GetInstallationForInstance} */
  const getInstallationForInstance = async instance =>
    instanceToInstanceAdmin.get(instance).getInstallationForInstance();

  return harden({
    getPublicFacet,
    getBrands,
    getIssuers,
    getTerms,
    getInstallationForInstance,
    getInstanceAdmin: instanceToInstanceAdmin.get,
    initInstanceAdmin: instanceToInstanceAdmin.init,
    deleteInstanceAdmin: instanceToInstanceAdmin.delete,
  });
};
