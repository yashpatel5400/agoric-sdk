// @ts-check

import { cleanProposal } from '../../cleanProposal';
import { burnInvitation } from './burnInvitation';

import '@agoric/ertp/exported';
import '@agoric/store/exported';
import '../../../exported';
import '../internal-types';

/**
 * @param {Issuer} invitationIssuer
 * @param {GetInstanceAdmin} getInstanceAdmin
 * @param {DepositPayments} depositPayments
 * @param {GetAssetKindByBrand} getAssetKindByBrand
 * @param {ChargeFee} chargeFee
 * @param {Amount} fee
 * @returns {Offer}
 */
export const makeOffer = (
  invitationIssuer,
  getInstanceAdmin,
  depositPayments,
  getAssetKindByBrand,
  chargeFee,
  fee,
) => {
  /** @type {Offer} */
  const offer = async (
    chargeAccountP,
    invitation,
    uncleanProposal = harden({}),
    paymentKeywordRecord = harden({}),
  ) => {
    await chargeFee(chargeAccountP, fee);
    const { instanceHandle, invitationHandle } = await burnInvitation(
      invitationIssuer,
      invitation,
    );
    // AWAIT ///
    const instanceAdmin = getInstanceAdmin(instanceHandle);
    instanceAdmin.assertAcceptingOffers();

    const proposal = cleanProposal(uncleanProposal, getAssetKindByBrand);
    const initialAllocation = await depositPayments(
      proposal,
      paymentKeywordRecord,
    );
    // AWAIT ///

    // This triggers the offerHandler in ZCF
    const userSeat = await instanceAdmin.makeUserSeat(
      invitationHandle,
      initialAllocation,
      proposal,
    );
    // AWAIT ///
    return userSeat;
  };
  return offer;
};
