/* global __dirname */
// eslint-disable-next-line import/order
import { test } from '../tools/prepare-test-env-ava';

import path from 'path';
import anylogger from 'anylogger';

import { WeakRef, FinalizationRegistry } from '../src/weakref';
import { waitUntilQuiescent } from '../src/waitUntilQuiescent';

import buildKernel from '../src/kernel/index';
import { initializeKernel } from '../src/kernel/initializeKernel';
import {
  buildVatController,
  initializeSwingset,
  makeSwingsetController,
} from '../src';
import { provideHostStorage } from '../src/hostStorage';
import {
  makeMessage,
  makeResolutions,
  makeDropExports,
  makeRetireExports,
  makeRetireImports,
  capdataOneSlot,
} from './util';

function capdata(body, slots = []) {
  return harden({ body, slots });
}

function capargs(args, slots = []) {
  return capdata(JSON.stringify(args), slots);
}

function makeConsole(tag) {
  const log = anylogger(tag);
  const cons = {};
  for (const level of ['debug', 'log', 'info', 'warn', 'error']) {
    cons[level] = log[level];
  }
  return harden(cons);
}

function bigintReplacer(_, arg) {
  if (typeof arg === 'bigint') {
    return Number(arg);
  }
  return arg;
}

function makeEndowments() {
  return {
    waitUntilQuiescent,
    hostStorage: provideHostStorage(),
    runEndOfCrank: () => {},
    makeConsole,
    writeSlogObject: o => console.log(JSON.stringify(o, bigintReplacer)),
    WeakRef,
    FinalizationRegistry,
  };
}

function makeKernel() {
  const endowments = makeEndowments();
  const { kvStore } = endowments.hostStorage;
  initializeKernel({}, endowments.hostStorage);
  const kernel = buildKernel(endowments, {}, {});
  return { kernel, kvStore };
}

function dumpObjects(kernel) {
  const out = {};
  for (const row of kernel.dump().objects) {
    const [koid, owner, reachable, recognizable] = row;
    out[koid] = [owner, reachable, recognizable];
  }
  return out;
}

function dumpVatClist(kernel, vatID) {
  const ktov = {};
  const vtok = {};
  for (const row of kernel.dump().kernelTable) {
    const [kref, v, vref] = row;
    if (v === vatID) {
      ktov[kref] = vref;
      vtok[vref] = kref;
    }
  }
  return { ktov, vtok };
}

// basic drop/retire case analysis (one importing vat)
// - importer does 1: drop+retire, 2: drop then retire in separate cranks
// - exporter reacts to drop 3: with retire in same crank, 4: with retire in later crank
// - exporter's retire may provoke importer retire unless importer already did retire
// so:
// - 13: bob emits drop+retire, gc-actions drop+retire, alice rx drop and emits retire
//       - alice's retire doesn't provoke any gc actions: already done
//       - remaining gc-action retire is negated: already done
// - 14: bob emits drop+retire, gc-actions drop+retire, alice rx drop, alice rx retire
//       - alice cannot emit retire, everything is already gone
// - 23: bob emits drop, gc-actions drop, alice rx drop and emits retire, gc-action retire, bob rx retire
//       - bob cannot emit retire
// - 24AB: bob emits drop, gc-actions drop, alice rx drop, pause
//       - A: alice emits retire, gc-action retire, bob cannot emit retire
//       - B: bob emits retire, gc-action retire, alice cannot emit retire

async function prep(t, options = {}) {
  const {
    aliceRetiresImmediately = true,
    addCarol = false,
    sendToSelf = false,
    sendToBob = true,
    sendPromiseToCarol = true,
  } = options;
  const { kernel, kvStore } = makeKernel();
  await kernel.start();

  const vrefs = {}; // track vrefs within vats

  // Our two root objects (alice and bob) are pinned so they don't disappear
  // while the test is talking to them. So we make alice introduce "amy" as a
  // new object that's doomed to be collected. Bob first drops amy, then
  // retires her, provoking first a dropExports then a retireImports on
  // alice.

  vrefs.amyForAlice = 'o+101';
  const logA = [];
  function setupA(syscall, _state, _helpers, _vatPowers) {
    function dispatch(vd) {
      // console.log(`dispatchA`, vd);
      logA.push(vd);
      if (vd[0] === 'message' && vd[2].method === 'one-alice') {
        vrefs.aliceForAlice = vd[2].args.slots[0];
        syscall.send(
          vrefs.aliceForAlice,
          'two',
          capdataOneSlot(vrefs.amyForAlice),
        );
      }
      if (vd[0] === 'message' && vd[2].method === 'two') {
        // ignored
      }
      if (vd[0] === 'message' && vd[2].method === 'one-bob') {
        vrefs.bobForAlice = vd[2].args.slots[0];
        syscall.send(
          vrefs.bobForAlice,
          'two',
          capdataOneSlot(vrefs.amyForAlice),
        );
      }
      if (vd[0] === 'message' && vd[2].method === 'one-carol') {
        vrefs.carolForAlice = vd[2].args.slots[0];
        syscall.send(
          vrefs.carolForAlice,
          'two',
          capdataOneSlot(vrefs.amyForAlice),
        );
      }
      if (vd[0] === 'dropExports' && aliceRetiresImmediately) {
        // pretend there are no local strongrefs, and as soon as liveslots
        // drops it's claim, the object goes away completely
        syscall.retireExports(vd[1]);
      }
      if (vd[0] === 'message' && vd[2].method === 'retire') {
        // or, pretend a local strongref was dropped somewhat later
        syscall.retireExports([vrefs.amyForAlice]);
      }
    }
    return dispatch;
  }
  await kernel.createTestVat('vatA', setupA);
  const vatA = kernel.vatNameToID('vatA');
  vrefs.aliceForAlice = 'o+100';
  const alice = kernel.addExport(vatA, vrefs.aliceForAlice);

  vrefs.promiseForBob = 'p+5';
  vrefs.resultPromiseForBob = 'p+6';
  const logB = [];
  function setupB(syscall, _state, _helpers, _vatPowers) {
    function dispatch(vd) {
      logB.push(vd);
      // console.log(`dispatchB`, vd);
      if (vd[0] === 'message' && vd[2].method === 'two') {
        vrefs.amyForBob = vd[2].args.slots[0];
      }
      if (vd[0] === 'message' && vd[2].method === 'drop') {
        syscall.dropImports([vrefs.amyForBob]);
      }
      if (vd[0] === 'retireImports') {
        // ignored
      }
      if (vd[0] === 'message' && vd[2].method === 'drop and retire') {
        syscall.dropImports([vrefs.amyForBob]);
        syscall.retireImports([vrefs.amyForBob]);
      }
      if (vd[0] === 'message' && vd[2].method === 'retire') {
        // It would be an error for bob to do this before or without
        // dropImports. TODO exercise this and verify that it causes a
        // syscall error.
        syscall.retireImports([vrefs.amyForBob]);
      }
      if (vd[0] === 'message' && vd[2].method === 'give-amy') {
        vrefs.carolForBob = vd[2].args.slots[0];
        syscall.send(vrefs.carolForBob, 'two', capdataOneSlot(vrefs.amyForBob));
      }

      if (vd[0] === 'message' && vd[2].method === 'give-carol-promise') {
        vrefs.carolForBob = vd[2].args.slots[0];
        // send carol a message (with a result promise) that contains a
        // promise we can resolve
        syscall.send(
          vrefs.carolForBob,
          'get-promises',
          capdataOneSlot(vrefs.promiseForBob),
          vrefs.resultPromiseForBob,
        );
        // we don't syscall.subscribe(), so we won't hear about the result
      }

      if (vd[0] === 'message' && vd[2].method === 'resolve-promise-to-amy') {
        // resolve the previously-sent promise to amy, and drop amy entirely
        syscall.resolve([
          [vrefs.promiseForBob, false, capdataOneSlot(vrefs.amyForBob)],
        ]);
        syscall.dropImports([vrefs.amyForBob]);
        syscall.retireImports([vrefs.amyForBob]);
      }

      if (
        vd[0] === 'message' &&
        vd[2].method === 'send-amy-to-result-promise'
      ) {
        // send amy in a message that will get queued to the result promise
        syscall.send(
          vrefs.resultPromiseForBob,
          'queued-message',
          capdataOneSlot(vrefs.amyForBob),
        );
        // and drop amy entirely
        syscall.dropImports([vrefs.amyForBob]);
        syscall.retireImports([vrefs.amyForBob]);
      }
    }
    return dispatch;
  }
  await kernel.createTestVat('vatB', setupB);
  const vatB = kernel.vatNameToID('vatB');
  vrefs.bobForBob = 'o+200';
  const bob = kernel.addExport(vatB, vrefs.bobForBob);

  const logC = [];
  function setupC(syscall, _state, _helpers, _vatPowers) {
    function dispatch(vd) {
      logC.push(vd);
      if (vd[0] === 'message' && vd[2].method === 'two') {
        vrefs.amyForCarol = vd[2].args.slots[0];
      }
      if (vd[0] === 'message' && vd[2].method === 'drop') {
        syscall.dropImports([vrefs.amyForCarol]);
      }
      if (vd[0] === 'message' && vd[2].method === 'drop and retire') {
        syscall.dropImports([vrefs.amyForCarol]);
        syscall.retireImports([vrefs.amyForCarol]);
      }
      if (vd[0] === 'message' && vd[2].method === 'retire') {
        syscall.retireImports([vrefs.amyForCarol]);
      }
      if (vd[0] === 'message' && vd[2].method === 'get-promises') {
        vrefs.promiseForCarol = vd[2].args.slots[0];
        vrefs.resultPromiseForCarol = vd[2].result;
        syscall.subscribe(vrefs.promiseForCarol);
      }
      if (vd[0] === 'message' && vd[2].method === 'resolve-result') {
        const res0 = [
          vrefs.resultPromiseForCarol,
          false,
          capdataOneSlot(vrefs.carolForCarol),
        ];
        syscall.resolve([res0]);
      }
      if (vd[0] === 'message' && vd[2].method === 'reject-result') {
        const res0 = [vrefs.resultPromiseForCarol, true, capargs(0)];
        syscall.resolve([res0]);
      }
      if (vd[0] === 'message' && vd[2].method === 'queued-message') {
        vrefs.amyForCarol = vd[2].args.slots[0];
      }
      if (vd[0] === 'notify') {
        const resolutions = vd[1];
        t.is(resolutions.length, 1); // only expect one resolution
        const [vpid, isReject, data] = resolutions[0];
        t.is(vpid, vrefs.promiseForCarol);
        t.false(isReject);
        vrefs.amyForCarol = data.slots[0];
      }
    }
    return dispatch;
  }
  await kernel.createTestVat('vatC', setupC);
  const vatC = kernel.vatNameToID('vatC');
  vrefs.carolForCarol = 'o+200';
  const carol = kernel.addExport(vatC, vrefs.carolForCarol);

  if (sendToBob) {
    kernel.queueToKref(alice, 'one-bob', capdataOneSlot(bob), 'none');
    await kernel.run();

    t.is(vrefs.bobForAlice, 'o-50'); // expected, but arbitrary
    t.deepEqual(
      logA.shift(),
      makeMessage(
        vrefs.aliceForAlice,
        'one-bob',
        capdataOneSlot(vrefs.bobForAlice),
      ),
    );
    // alice sends bob~.two(amy)

    // bob gets two(amy)
    t.is(vrefs.amyForBob, 'o-50'); // different vat, same starting point
    t.deepEqual(
      logB.shift(),
      makeMessage(vrefs.bobForBob, 'two', capdataOneSlot(vrefs.amyForBob)),
    );
  }

  if (sendToSelf) {
    kernel.queueToKref(alice, 'one-alice', capdataOneSlot(alice), 'none');
    await kernel.step();
  }

  // look up amy's kref
  const amy = kvStore.get(`${vatA}.c.${vrefs.amyForAlice}`); // ko22
  t.truthy(amy);
  // console.log(`amy is ${amy}`);

  // if sendToBob, then amy should be REACHABLE (reachable+recognizable) by
  // bob, so refcount=1,1 . If sendToSelf, it should be in the run-queue, so
  // also 1,1.
  t.deepEqual(dumpObjects(kernel)[amy], [vatA, 1, 1]);

  if (sendPromiseToCarol) {
    kernel.queueToKref(
      bob,
      'give-carol-promise',
      capdataOneSlot(carol),
      'none',
    );
    await kernel.run();
    t.deepEqual(
      logB.shift(),
      makeMessage(
        vrefs.bobForBob,
        'give-carol-promise',
        capdataOneSlot(vrefs.carolForBob),
      ),
    );
    t.deepEqual(logB, []);
    t.deepEqual(
      logC.shift(),
      makeMessage(
        vrefs.carolForCarol,
        'get-promises',
        capdataOneSlot(vrefs.promiseForCarol),
        vrefs.resultPromiseForCarol,
      ),
    );
    t.deepEqual(logC, []);
  }

  if (addCarol) {
    kernel.queueToKref(alice, 'one-carol', capdataOneSlot(carol), 'none');
    await kernel.run();
    t.deepEqual(
      logA.shift(),
      makeMessage(
        vrefs.aliceForAlice,
        'one-carol',
        capdataOneSlot(vrefs.carolForAlice),
      ),
    );
    t.deepEqual(dumpObjects(kernel)[amy], [vatA, 2, 2]);
    t.deepEqual(
      logC.shift(),
      makeMessage(
        vrefs.carolForCarol,
        'two',
        capdataOneSlot(vrefs.amyForCarol),
      ),
    );
  }

  function aliceClistPresent() {
    return !!dumpVatClist(kernel, vatA).ktov[amy];
  }
  function bobClistPresent() {
    return !!dumpVatClist(kernel, vatB).ktov[amy];
  }
  function carolClistPresent() {
    return !!dumpVatClist(kernel, vatC).ktov[amy];
  }
  function amyRetired() {
    // console.log(`+ amy:`, JSON.stringify(dumpObjects(kernel)[amy]));
    return dumpObjects(kernel)[amy] === undefined;
  }
  function gcActionsAre(expected) {
    t.deepEqual(kernel.dump().gcActions, expected);
  }
  const krefs = { alice, amy, bob, carol };
  const logs = { logA, logB, logC };
  const vats = { vatA, vatB, vatC };
  const preds = {
    aliceClistPresent,
    bobClistPresent,
    carolClistPresent,
    amyRetired,
    gcActionsAre,
  };
  return { kernel, vrefs, ...krefs, ...logs, ...vats, ...preds };
}

// bob emits drop+retire on the same delivery: modes 13 and 14
async function testDropAndRetire(t, mode) {
  const aliceRetiresImmediately = mode === '13';
  const p = await prep(t, { aliceRetiresImmediately });
  const { amy, bob, vatA, vrefs } = p;
  // tell bob to both drop and retire amy
  p.kernel.queueToKref(bob, 'drop and retire', capargs([]), 'none');
  await p.kernel.step();
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 0, 0]);
  // so there should be both dropExports and retireExports gc actions
  p.gcActionsAre([`${vatA} dropExport ${amy}`, `${vatA} retireExport ${amy}`]);

  await p.kernel.step();
  t.deepEqual(p.logA.shift(), makeDropExports(vrefs.amyForAlice));
  t.deepEqual(p.logA, []);

  if (mode === '13') {
    // mode 13: Alice got dropExport and emitted retire right away. Her
    // retireExport deletes her clist and deletes the kernel object.
    t.false(p.aliceClistPresent());
    t.true(p.amyRetired());
  } else if (mode === '14') {
    // mode 14: Alice got dropExport, but did not retire yet.
    t.true(p.aliceClistPresent());
    t.false(p.amyRetired());
  }
  // meanwhile the retireExport gc action is still pending
  p.gcActionsAre([`${vatA} retireExport ${amy}`]);
  await p.kernel.step();
  // mode13: it will be negated because the kobj is already gone
  // mode14: the retireExport gc action deletes the kobj and the clist.
  if (mode === '14') {
    t.deepEqual(p.logA.shift(), makeRetireExports(vrefs.amyForAlice));
  }
  t.deepEqual(p.logA, []);
  t.false(p.aliceClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
}

test('mode13', async t => {
  return testDropAndRetire(t, '13');
});

test('mode14', async t => {
  return testDropAndRetire(t, '14');
});

// bob emits only drop during the first delivery: modes 23, 24A, 24B
async function testDrop(t, mode) {
  const aliceRetiresImmediately = mode === '23';
  const p = await prep(t, { aliceRetiresImmediately });
  const { amy, alice, bob, vatA, vatB, vrefs } = p;

  // tell bob to drop amy, but not retire
  p.kernel.queueToKref(bob, 'drop', capargs([]), 'none');
  await p.kernel.step();
  t.true(p.aliceClistPresent());
  t.true(p.bobClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 0, 1]);
  // there should just the dropExports gc action pending
  p.gcActionsAre([`${vatA} dropExport ${amy}`]);

  await p.kernel.step();
  t.deepEqual(p.logA.shift(), makeDropExports(vrefs.amyForAlice));
  t.deepEqual(p.logA, []);

  if (mode === '23') {
    // Alice got dropExport and emitted retire right away. Her retireExport
    // deletes her clist and deletes the kernel object, and posts a
    // retireImport to Bob (the only importer).
    t.false(p.aliceClistPresent());
    t.true(p.bobClistPresent());
    t.true(p.amyRetired());
    p.gcActionsAre([`${vatB} retireImport ${amy}`]);
  } else if (mode === '24A' || mode === '24B') {
    // Alice got dropExport, but did not retire yet.
    t.true(p.aliceClistPresent());
    t.true(p.bobClistPresent());
    t.false(p.amyRetired());
    p.gcActionsAre([]);
    if (mode === '24A') {
      // 24A: alice emits retire first
      p.kernel.queueToKref(alice, 'retire', capargs([]), 'none');
      await p.kernel.step();
      // that deletes the kobj and queues a retire to the importers (bob)
      t.false(p.aliceClistPresent());
      t.true(p.bobClistPresent());
      t.true(p.amyRetired());
      p.gcActionsAre([`${vatB} retireImport ${amy}`]);
    } else if (mode === '24B') {
      // 24B: bob emits retire first
      // console.log(`++ telling bob to retire first`);
      p.kernel.queueToKref(bob, 'retire', capargs([]), 'none');
      await p.kernel.step();
      // that was the last importer: queue a retire to the exporter
      t.true(p.aliceClistPresent());
      t.false(p.bobClistPresent());
      t.false(p.amyRetired());
      p.gcActionsAre([`${vatA} retireExport ${amy}`]);
    }
  }

  await p.kernel.step();
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
}

test('mode23', async t => {
  return testDrop(t, '23');
});

test('mode24A', async t => {
  return testDrop(t, '24A');
});

test('mode24B', async t => {
  return testDrop(t, '24B');
});

test('retire before drop is error', async t => {
  const { kernel } = makeKernel();
  await kernel.start();

  const amyForAlice = 'o+101';
  function setupA(syscall, _state, _helpers, _vatPowers) {
    function dispatch(vd) {
      // console.log(`dispatchA`, vd);
      if (vd[0] === 'message' && vd[2].method === 'one') {
        const bobForAlice = vd[2].args.slots[0];
        syscall.send(bobForAlice, 'two', capdataOneSlot(amyForAlice));
      }
    }
    return dispatch;
  }
  await kernel.createTestVat('vatA', setupA);
  const vatA = kernel.vatNameToID('vatA');
  const aliceForAlice = 'o+100';
  const alice = kernel.addExport(vatA, aliceForAlice);

  let syscallError;
  function setupB(syscall, _state, _helpers, _vatPowers) {
    let amyForBob;
    function dispatch(vd) {
      // console.log(`dispatchB`, vd);
      if (vd[0] === 'message' && vd[2].method === 'two') {
        amyForBob = vd[2].args.slots[0];
        // console.log(`+-- got amyForBob`, amyForBob);
      }
      if (vd[0] === 'message' && vd[2].method === 'retire') {
        // It is an error for bob to do this before or without
        // dropImports
        try {
          // console.log(`+-- doing s.retireImports`, amyForBob);
          syscall.retireImports([amyForBob]);
        } catch (e) {
          syscallError = e;
          // we're doomed
        }
      }
    }
    return dispatch;
  }
  await kernel.createTestVat('vatB', setupB);
  const vatB = kernel.vatNameToID('vatB');
  const bobForBob = 'o+200';
  const bob = kernel.addExport(vatB, bobForBob);

  // vatB will make a syscall error and be terminated
  kernel.queueToKref(alice, 'one', capdataOneSlot(bob), 'none');
  await kernel.run();

  let survivingVats = new Set();
  kernel.dump().vatTables.forEach(v => survivingVats.add(v.vatID));
  t.true(survivingVats.has(vatB));

  kernel.queueToKref(bob, 'retire', capargs([]), 'none');
  await kernel.run();

  t.truthy(syscallError);
  t.is(syscallError.name, 'Error');
  t.is(
    syscallError.message,
    'syscall.retireImports failed, prepare to die: syscall translation error: prepare to die',
  );

  // vat should be terminated
  survivingVats = new Set();
  kernel.dump().vatTables.forEach(v => survivingVats.add(v.vatID));
  t.false(survivingVats.has(vatB));
});

test('two importers both drop+retire', async t => {
  const p = await prep(t, { addCarol: true });
  const { amy, bob, carol, vatA, vrefs } = p;
  // tell bob to drop+retire amy
  p.kernel.queueToKref(bob, 'drop and retire', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'drop and retire', capargs([])),
  );
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  // carol drops+retires amy too
  p.kernel.queueToKref(carol, 'drop and retire', capargs([]), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop and retire', capargs([])),
  );
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.true(p.amyRetired());

  // both importers did both drop+retire, so they won't get any gc actions
  t.deepEqual(p.logB, []);
  t.deepEqual(p.logC, []);
});

test('two importers both drop but not retire', async t => {
  const p = await prep(t, { addCarol: true });
  const { amy, bob, carol, vatA, vatB, vatC, vrefs } = p;
  // tell bob to drop amy, but not retire
  p.kernel.queueToKref(bob, 'drop', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'drop', capargs([])),
  );
  t.true(p.aliceClistPresent());
  t.true(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 2]);
  p.gcActionsAre([]);
  // carol drops amy too
  p.kernel.queueToKref(carol, 'drop', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop', capargs([])),
  );
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 0, 2]);
  // no retirement yet: all clists are still present
  t.true(p.aliceClistPresent());
  t.true(p.bobClistPresent());
  t.true(p.carolClistPresent());
  p.gcActionsAre([`${vatA} dropExport ${amy}`]);

  // amy will get the drop now, she'll retire the object, and both bob and
  // carol will receive the retire action
  await p.kernel.step();
  t.false(p.aliceClistPresent());
  t.true(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([
    `${vatB} retireImport ${amy}`,
    `${vatC} retireImport ${amy}`,
  ]);
  t.deepEqual(p.logB, []);
  t.deepEqual(p.logC, []);

  // let the vatB retireImport get delivered
  await p.kernel.step();
  t.false(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.deepEqual(p.logB.shift(), makeRetireImports(vrefs.amyForBob));
  t.deepEqual(p.logB, []);

  // and vatC retireImport get delivered
  await p.kernel.step();
  t.false(p.carolClistPresent());
  t.deepEqual(p.logC.shift(), makeRetireImports(vrefs.amyForCarol));
  t.deepEqual(p.logC, []);
});

test('two importers: drop+retire, cross-import, drop+retire', async t => {
  const p = await prep(t, { addCarol: true });
  const { amy, bob, carol, vatA, vrefs } = p;
  // in the setup, both bob and carol are given a reference to amy

  // tell carol to drop+retire amy
  p.kernel.queueToKref(carol, 'drop and retire', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop and retire', capargs([])),
  );
  t.deepEqual(p.logC, []);
  t.true(p.aliceClistPresent());
  t.true(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);

  // now tell bob to send amy to carol, re-incrementing the refcount
  p.kernel.queueToKref(bob, 'give-amy', capdataOneSlot(carol), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'give-amy', capdataOneSlot(vrefs.carolForBob)),
  );
  t.deepEqual(p.logB, []);
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'two', capdataOneSlot(vrefs.amyForCarol)),
  );
  t.deepEqual(p.logC, []);
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 2, 2]);
  p.gcActionsAre([]);

  // bob drops+retires
  p.kernel.queueToKref(bob, 'drop and retire', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'drop and retire', capargs([])),
  );
  t.deepEqual(p.logB, []);
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);

  // carol drops+retires amy too
  p.kernel.queueToKref(carol, 'drop and retire', capargs([]), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop and retire', capargs([])),
  );
  t.deepEqual(p.logC, []);
  t.true(p.amyRetired());
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.deepEqual(p.logB, []);
});

// promise resolution holds the only reference
// bob sends promise to carol, let it arrive
// bob resolves promise to amy, drops+retires amy
// (check)
// resolved promise holds only ref, until notify(carol) reaches front

test('promise resolution holds the only reference', async t => {
  const p = await prep(t);
  const { amy, bob, carol, vatA, vrefs } = p;

  // The prepare step leaves carol holding a promise. Have bob resolve that
  // promise (to amy) and retire amy all in a single crank.
  p.kernel.queueToKref(bob, 'resolve-promise-to-amy', capargs([]), 'none');
  // step far enough to retire the GC actions

  // there should be a notify(carol) on the queue, and no GC actions
  await p.kernel.step();

  // amy should now be held alive by only the resolved promise data
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'resolve-promise-to-amy', capargs([])),
  );
  t.deepEqual(p.logB, []);
  t.deepEqual(p.logC, []);

  // when the notify(carol) runs, carol should acquire a reference, and the
  // resolved promise goes away, so the refcount should be back to 1
  await p.kernel.step();
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  const res0 = [
    vrefs.promiseForCarol,
    false,
    capdataOneSlot(vrefs.amyForCarol),
  ];
  t.deepEqual(p.logC.shift(), makeResolutions([res0]));
  t.deepEqual(p.logC, []);

  // now carol retires
  p.kernel.queueToKref(carol, 'drop and retire', capargs([]), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop and retire', capargs([])),
  );
  t.deepEqual(p.logC, []); // did drop+retire, no gc actions
  t.deepEqual(p.logB, []); // same for bob
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
});

// promise queue holds the only reference
// bob sends warmup msg to carol, with result promise
// bob sends amy in arg to non-pipelined msg to result promise, drops+retires amy
// (check)
// carol resolves promise to herself

test('promise queue holds the only reference, resolved', async t => {
  const p = await prep(t);
  const { amy, bob, carol, vatA, vrefs } = p;

  // The prepare step leaves carol as the decider of a result promise. Have
  // bob queue a message (containing amy) to that result promise.
  p.kernel.queueToKref(bob, 'send-amy-to-result-promise', capargs([]), 'none');
  // bob sends 'queued-message(amy)' to the promise, then drops amy
  await p.kernel.run();
  // amy should now be held alive by only the queued message
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'send-amy-to-result-promise', capargs([])),
  );
  t.deepEqual(p.logB, []);
  t.deepEqual(p.logC, []);

  // tell carol to resolve the promise (to herself), transferring
  // 'queued-message()' from the promise queue to the regular run-queue
  p.kernel.queueToKref(carol, 'resolve-result', capargs([]), 'none');
  await p.kernel.step();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'resolve-result', capargs([])),
  );
  t.deepEqual(p.logC, []);
  t.deepEqual(p.logB, []);
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  // bob didn't subscribe(), so the run-queue should have just
  // carol.queued-message, which will give carol access to amy

  await p.kernel.run();
  t.deepEqual(p.logB, []);
  t.deepEqual(
    p.logC.shift(),
    makeMessage(
      vrefs.carolForCarol,
      'queued-message',
      capdataOneSlot(vrefs.amyForCarol),
    ),
  );
  t.deepEqual(p.logC, []);
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.true(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);

  // now carol retires
  p.kernel.queueToKref(carol, 'drop and retire', capargs([]), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'drop and retire', capargs([])),
  );
  t.deepEqual(p.logC, []); // did drop+retire, no gc actions
  t.deepEqual(p.logB, []); // same for bob
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
});

test('promise queue holds the only reference, rejected', async t => {
  const p = await prep(t);
  const { amy, bob, carol, vatA, vrefs } = p;

  // The prepare step leaves carol as the decider of a result promise. Have
  // bob queue a message (containing amy) to that result promise.
  p.kernel.queueToKref(bob, 'send-amy-to-result-promise', capargs([]), 'none');
  // bob sends 'queued-message(amy)' to the promise, then drops amy
  await p.kernel.run();
  // amy should now be held alive by only the queued message
  t.true(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);
  t.deepEqual(
    p.logB.shift(),
    makeMessage(vrefs.bobForBob, 'send-amy-to-result-promise', capargs([])),
  );
  t.deepEqual(p.logB, []);
  t.deepEqual(p.logC, []);

  // tell carol to reject the promise, which should reject the queued message
  // and drop its arguments. we charge ahead and let everything retire.
  p.kernel.queueToKref(carol, 'reject-result', capargs([]), 'none');
  await p.kernel.run();
  t.deepEqual(
    p.logC.shift(),
    makeMessage(vrefs.carolForCarol, 'reject-result', capargs([])),
  );
  t.deepEqual(p.logC, []); // never had amy, no gc actions
  // bob didn't subscribe, so the result promise dies forgotten
  // and bob already did drop+retire, so no gc actions will be delivered
  t.deepEqual(p.logB, []);
  t.false(p.aliceClistPresent());
  t.false(p.bobClistPresent());
  t.false(p.carolClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
});

// message to self: make sure sending a message to yourself doesn't cause
// problems. The refcount comes from the run-queue, but never from anybody
// else's c-lists. Liveslots doesn't offer vat code a way to do this yet, but
// it might happen in the future.

test('message to self', async t => {
  const p = await prep(t, {
    sendToSelf: true,
    sendToBob: false,
    sendPromiseToCarol: false,
  });
  const { amy, vatA } = p;
  // the message-to-self is sitting on the run queue now, and we have
  // refcount=1 from that message
  t.true(p.aliceClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 1, 1]);
  p.gcActionsAre([]);

  // deliver the message-to-self, which should drop the refcount to 0
  await p.kernel.step();
  t.true(p.aliceClistPresent());
  t.false(p.amyRetired());
  t.deepEqual(dumpObjects(p.kernel)[amy], [vatA, 0, 0]);
  p.gcActionsAre([`${vatA} dropExport ${amy}`, `${vatA} retireExport ${amy}`]);

  await p.kernel.run();
  t.false(p.aliceClistPresent());
  t.true(p.amyRetired());
  p.gcActionsAre([]);
});

test('terminated vat drops imports', async t => {
  const config = {
    vats: {
      bootstrap: {
        sourceSpec: path.join(__dirname, 'gc-dead-vat', 'bootstrap.js'),
      },
    },
    bootstrap: 'bootstrap',
    bundles: {
      doomed: {
        sourceSpec: path.join(__dirname, 'gc-dead-vat', 'vat-doomed.js'),
      },
    },
  };
  const c = await buildVatController(config, []);
  await c.run();
  const bootstrapVat = c.vatNameToID('bootstrap');
  // now find the dynamic vat and figure out what it imports/exports
  const allVatIDs = Array.from(new Set(c.dump().vatTables.map(o => o.vatID)));
  t.true(allVatIDs.length < 10); // so we can sort 'vNN' lexicographically
  allVatIDs.sort();
  const doomedVat = allVatIDs[allVatIDs.length - 1];
  t.is(doomedVat, 'v6');
  const usedByDoomed = c
    .dump()
    .kernelTable.filter(o => o[1] === doomedVat)
    .map(o => [o[0], o[2]]);
  const vrefs = {};
  usedByDoomed.forEach(([kref, vref]) => (vrefs[vref] = kref));
  // console.log(`usedByDoomed vrefs`, vrefs);
  const imports = Object.keys(vrefs).filter(vref => vref.startsWith('o-'));

  // there will be one import: exportToDoomed / pin
  t.is(imports.length, 1);
  const pinVref = imports[0];
  t.is(pinVref, 'o-50'); // arbitrary but this is what we expect
  const pinKref = vrefs[pinVref];
  // we'll watch for this to be deleted when the vat is terminated
  // console.log(`pinKref`, pinKref);

  // find the highest export: exportedRemotable / fromDoomed
  const exports = Object.keys(vrefs).filter(vref => vref.startsWith('o+'));
  exports.sort();
  const exportedVref = exports[exports.length - 1];
  t.is(exportedVref, 'o+1'); // arbitrary
  const exportedKref = vrefs[exportedVref];
  // this should also be deleted
  // console.log(`exportedKref`, exportedKref);

  let refcounts = {};
  let owners = {};
  c.dump().objects.forEach(o => (refcounts[o[0]] = [o[2], o[3]]));
  c.dump().objects.forEach(o => (owners[o[0]] = o[1]));
  t.deepEqual(refcounts[pinKref], [1, 1]);
  t.is(owners[pinKref], bootstrapVat);
  t.deepEqual(refcounts[exportedKref], [1, 1]);
  t.is(owners[exportedKref], doomedVat);

  c.queueToVatExport(
    'bootstrap',
    'o+0',
    'startTerminate',
    capargs([]),
    'panic',
  );
  await c.run();
  // console.log(c.dump());

  refcounts = {};
  c.dump().objects.forEach(o => (refcounts[o[0]] = [o[2], o[3]]));
  owners = {};
  c.dump().objects.forEach(o => (owners[o[0]] = o[1]));

  // the bootstrap vat exports an object ('exportToDoomed') that is only kept
  // alive by the doomed vat's import, so it should be gone by now
  t.deepEqual(refcounts[pinKref], undefined);
  t.is(owners[pinKref], undefined);
  // however the doomed vat's export is now an orphan: it retains identity,
  // and the bootstrap vat is still importing it
  t.deepEqual(refcounts[exportedKref], [1, 1]);
  t.falsy(owners[exportedKref]);

  t.pass();
});

// device receives object from vat a, returns to vat b

test('device transfer', async t => {
  function vatpath(fn) {
    return { sourceSpec: path.join(__dirname, 'gc-device-transfer', fn) };
  }
  const config = {
    vats: {
      bootstrap: vatpath('bootstrap-gc.js'),
      left: vatpath('vat-left-gc.js'),
      right: vatpath('vat-right-gc.js'),
    },
    bootstrap: 'bootstrap',
    devices: {
      stash_device: {
        creationOptions: { unendowed: true },
        ...vatpath('device-gc.js'),
      },
    },
  };

  const hostStorage = provideHostStorage();
  await initializeSwingset(config, [], hostStorage);
  const c = await makeSwingsetController(hostStorage);

  // The bootstrap() message is already queued. When we call c.step(), it
  // will stash 'amy' in the device, send 'amy' to vat-left, and send the
  // device (but not amy) to vat-right. vat-left will forget about amy right
  // away. When everything settles, the only reference to amy should be from
  // the device.

  await c.run();
  // now rummage through the kernel state to locate the kref for amy and get
  // the reference count
  const { kvStore } = hostStorage;
  const deviceID = kvStore.get('device.name.stash_device');
  const state = kvStore.get(`${deviceID}.deviceState`);
  const dref = JSON.parse(state).slots[0];
  t.is(dref, 'o-10'); // arbitrary but this is what we expect
  const kref = kvStore.get(`${deviceID}.c.${dref}`);
  t.is(kref, 'ko27'); // ditto
  function getRefCounts() {
    return kvStore.get(`${kref}.refCount`); // e.g. "1,1"
  }
  // the device should hold a reachable+recognizable reference and since
  // liveslots is not yet emitting `retireImport`, vat-left (which forgot
  // about amy) is still holding a 'recognizable' reference, making the
  // expected count 1,2 . If deviceKeeper.js failed to establish a reference,
  // the count would have reached 0,1, and amy would have been collected.
  t.is(getRefCounts(), '1,2');

  // now tell vat-right to retrieve amy from the device
  c.queueToVatExport('right', 'o+0', 'getAmy', capargs([]), 'none');
  await c.run();
  t.deepEqual(c.dump().log, ['vat-right got amy', 'hi amy from vat-right']);
});