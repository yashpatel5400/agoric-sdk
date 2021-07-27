// @ts-check

import { makeWeakStore as makeNonVOWeakStore } from '@agoric/store';
import { E } from '@agoric/eventual-send';

/**
 * @param {ChargeFee} chargeFee
 * @param {Amount} fee
 * @returns {{
 *   getPublicFacet: GetPublicFacet,
 *   getBrands: GetBrands,
 *   getIssuers: GetIssuers,
 *   getTerms: GetTerms,
 *   getInstanceAdmin: (instance: Instance) => InstanceAdmin,
 *   initInstanceAdmin: (instance: Instance, instanceAdmin:
 *   InstanceAdmin) => void,
 *   deleteInstanceAdmin: (instance: Instance) => void,
 * }}
 */
export const makeInstanceAdminStorage = (chargeFee, fee) => {
  /** @type {WeakStore<Instance,InstanceAdmin>} */
  const instanceToInstanceAdmin = makeNonVOWeakStore('instance');

  /** @type {GetPublicFacet} */
  const getPublicFacet = async (chargeAccountP, instanceP) => {
    await chargeFee(chargeAccountP, fee);

    return E.when(instanceP, instance =>
      instanceToInstanceAdmin.get(instance).getPublicFacet(),
    );
  };

  /** @type {GetBrands} */
  const getBrands = instanceP =>
    E.when(instanceP, instance =>
      instanceToInstanceAdmin.get(instance).getBrands(),
    );

  /** @type {GetIssuers} */
  const getIssuers = instanceP =>
    E.when(instanceP, instance =>
      instanceToInstanceAdmin.get(instance).getIssuers(),
    );

  /** @type {GetTerms} */
  const getTerms = instanceP =>
    E.when(instanceP, instance =>
      instanceToInstanceAdmin.get(instance).getTerms(),
    );

  return harden({
    getPublicFacet,
    getBrands,
    getIssuers,
    getTerms,
    getInstanceAdmin: instanceToInstanceAdmin.get,
    initInstanceAdmin: instanceToInstanceAdmin.init,
    deleteInstanceAdmin: instanceToInstanceAdmin.delete,
  });
};
