// @ts-check

import { E } from '@agoric/eventual-send';
import { makeNotifierKit } from '@agoric/notifier';
import { natSafeMath } from '../../contractSupport';

import { scheduleLiquidation } from './scheduleLiquidation';

export const calculateCollateralizationRatio = async (
  priceAuthority,
  collateralGiven,
  loanWanted,
) => {
  const { quoteAmount } = await E(priceAuthority).quoteGiven(
    collateralGiven,
    loanWanted.brand,
  );
  // AWAIT ///

  const collateralValueInLoanBrand = quoteAmount.value[0].amountOut.value;
  const numerator = natSafeMath.multiply(collateralValueInLoanBrand, 100);
  const denominator = loanWanted.value;
  return natSafeMath.floorDivide(numerator, denominator);
};

/** @type {MakeDisplayNotifierKit} */
export const makeDisplayNotifierKit = zcf => {
  const { notifier, updater } = makeNotifierKit();

  /** @type {UpdateState} */
  const updateState = async (config, liquidated = false) => {
    const {
      interestRate,
      mmr,
      getDebt,
      collateralSeat,
      priceAuthority,
    } = config;
    const locked = collateralSeat.getAmountAllocated('Collateral');
    const debt = getDebt();
    const collateralizationRatio = await calculateCollateralizationRatio(
      priceAuthority,
      locked,
      debt,
    );
    /** @type {UIState} */
    const state = {
      interestRate, // will not change
      liquidationRatio: mmr, // will not change
      locked,
      debt,
      collateralizationRatio, // depends on locked to debt ratio
      liquidated, // boolean of whether liquidation occurred
    };

    updater.updateState(state);

    // Schedule the liquidation. If the liquidation cannot be scheduled
    // because of a problem with a misconfigured priceAuthority, an
    // error will be thrown and the borrower will be stuck with their
    // loan and the lender will receive the collateral. It is
    // important for the borrower to validate the priceAuthority for
    // this reason.
    scheduleLiquidation(zcf, config);
  };

  return harden({
    displayNotifier: notifier,
    updateState,
  });
};
