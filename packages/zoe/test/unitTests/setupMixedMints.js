// @ts-check

import { makeIssuerKit, AmountMath, AssetKind } from '@agoric/ertp';
import { makeZoe } from '../../src/zoeService/zoe.js';
import fakeVatAdmin from '../../tools/fakeVatAdmin.js';
import { makeAndApplyFeePurse } from '../../src/applyFeePurse.js';

const setupMixed = () => {
  const ccBundle = makeIssuerKit('CryptoCats', AssetKind.SET);
  const moolaBundle = makeIssuerKit('moola');
  const allBundles = { cc: ccBundle, moola: moolaBundle };
  const mints = new Map();
  const issuers = new Map();
  const brands = new Map();

  for (const k of Object.getOwnPropertyNames(allBundles)) {
    mints.set(k, allBundles[k].mint);
    issuers.set(k, allBundles[k].issuer);
    brands.set(k, allBundles[k].brand);
  }

  const ccIssuer = issuers.get('cc');
  const moolaIssuer = issuers.get('moola');
  const ccMint = mints.get('cc');
  const moolaMint = mints.get('moola');
  const cryptoCats = value => AmountMath.make(value, allBundles.cc.brand);
  const moola = value => AmountMath.make(value, allBundles.moola.brand);

  const { zoeService } = makeZoe(fakeVatAdmin);
  const { zoeService: zoe } = makeAndApplyFeePurse(zoeService);
  return {
    zoe,
    ccIssuer,
    moolaIssuer,
    ccMint,
    moolaMint,
    cryptoCats,
    moola,
    brands,
  };
};
harden(setupMixed);
export { setupMixed };
