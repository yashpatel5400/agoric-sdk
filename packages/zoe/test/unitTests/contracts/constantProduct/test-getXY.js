// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { getXY } from '../../../../src/contracts/constantProduct/getXY';
import { setupMintKits } from './setupMints';

// There's no difference between SwapIn and SwapOut for this function
test('swap Central for Secondary', t => {
  const { run, bld } = setupMintKits();

  const swapperAllocation = {
    In: run(2000n),
  };
  const poolAllocation = {
    Central: run(102902920n),
    Secondary: bld(203838393n),
  };
  const swapperProposal = {
    give: {
      In: run(2000n),
    },
    want: {
      Out: bld(2819n),
    },
    exit: {
      onDemand: null,
    },
  };
  const { x, y, deltaX, wantedDeltaY } = getXY(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
  );

  t.deepEqual(x, poolAllocation.Central);
  t.deepEqual(y, poolAllocation.Secondary);
  t.deepEqual(deltaX, swapperAllocation.In);
  t.deepEqual(wantedDeltaY, swapperProposal.want.Out);
});

test('swap Secondary for Central', t => {
  const { run, bld } = setupMintKits();

  const swapperAllocation = {
    In: bld(2000n),
  };
  const poolAllocation = {
    Central: run(102902920n),
    Secondary: bld(203838393n),
  };
  const swapperProposal = {
    give: {
      In: bld(2000n),
    },
    want: {
      Out: run(2819n),
    },
    exit: {
      onDemand: null,
    },
  };
  const { x, y, deltaX, wantedDeltaY } = getXY(
    swapperAllocation,
    poolAllocation,
    swapperProposal,
  );

  t.deepEqual(x, poolAllocation.Secondary);
  t.deepEqual(y, poolAllocation.Central);
  t.deepEqual(deltaX, swapperAllocation.In);
  t.deepEqual(wantedDeltaY, swapperProposal.want.Out);
});
