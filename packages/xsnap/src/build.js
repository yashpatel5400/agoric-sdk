#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
/* global process */
// @ts-check
import * as childProcessTop from 'child_process';
import fsTop from 'fs';
import osTop from 'os';

const { freeze } = Object;

/** @param { string } path */
const asset = path => new URL(path, import.meta.url).pathname;

const ModdableSDK = {
  MODDABLE: asset('../moddable'),
  /** @type { Record<string, { path: string, make?: string }>} */
  platforms: {
    Linux: { path: 'lin' },
    Darwin: { path: 'mac' },
    Windows_NT: { path: 'win', make: 'nmake' },
  },
  buildGoals: ['release', 'debug'],
};

/**
 * Adapt spawn to Promises style.
 *
 * @param {string} command
 * @param {{
 *   spawn: typeof import('child_process').spawn,
 * }} io
 */
function makeCLI(command, { spawn }) {
  /** @param { import('child_process').ChildProcess } child */
  const waiting = child =>
    new Promise((resolve, reject) => {
      child.on('close', () => {
        resolve(undefined);
      });
      child.on('error', err => {
        reject(new Error(`${command} error ${err}`));
      });
      child.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });

  return freeze({
    /**
     * @param {string[]} args
     * @param {{ cwd?: string }=} opts
     */
    run: (args, opts) => {
      const { cwd = '.' } = opts || {};
      const child = spawn(command, args, {
        cwd,
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      return waiting(child);
    },
    /**
     * @param {string[]} args
     * @param {{ cwd?: string }=} opts
     */
    pipe: (args, opts) => {
      const { cwd = '.' } = opts || {};
      const child = spawn(command, args, {
        cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        output += data.toString();
      });
      return waiting(child).then(() => output);
    },
  });
}

/**
 * @param {string} path
 * @param {string} repoUrl
 * @param {{ git: ReturnType<typeof makeCLI> }} io
 */
const makeSubmodule = (path, repoUrl, { git }) => {
  /** @param { string } text */
  const parseStatus = text =>
    text
      .split('\n')
      .map(line => line.split(' ', 4))
      .map(([_indent, hash, statusPath, describe]) => ({
        hash,
        path: statusPath,
        describe,
      }));
  return freeze({
    path,
    clone: async () => git.run(['clone', repoUrl, path]),
    /** @param { string } commitHash */
    checkout: async commitHash =>
      git.run(['checkout', commitHash], { cwd: path }),
    init: async () => git.run(['submodule', 'update', '--init', '--checkout']),
    status: async () =>
      git.pipe(['submodule', 'status', path]).then(parseStatus),
  });
};

/**
 * @param { string[] } args
 * @param {{
 *   env: Record<string, string | undefined>,
 *   stdout: typeof process.stdout,
 *   spawn: typeof import('child_process').spawn,
 *   fs: {
 *     existsSync: typeof import('fs').existsSync,
 *     readFile: typeof import('fs').promises.readFile,
 *   },
 *   os: {
 *     type: typeof import('os').type,
 *   }
 * }} io
 */
async function main(args, { env, stdout, spawn, fs, os }) {
  const git = makeCLI('git', { spawn });

  const submodules = [
    {
      url: env.MODDABLE_URL || 'https://github.com/agoric-labs/moddable.git',
      path: ModdableSDK.MODDABLE,
      commitHash: env.MODDABLE_COMMIT_HASH,
      envPrefix: 'MODDABLE_',
    },
    {
      url:
        env.XSNAP_NATIVE_URL || 'https://github.com/agoric-labs/xsnap-pub.git',
      path: asset('../xsnap-native'),
      commitHash: env.XSNAP_NATIVE_HASH,
      envPrefix: 'XSNAP_NATIVE_',
    },
  ];

  if (args.includes('--show-env')) {
    for (const { path, envPrefix } of submodules) {
      const submodule = makeSubmodule(path, '?', { git });
      const [{ hash }] = await submodule.status();
      // stdout.write(`${envPrefix}URL=${url}\n`);
      stdout.write(`${envPrefix}HASH=${hash}\n`);
    }
    return;
  }

  for (const { url, path, commitHash } of submodules) {
    const submodule = makeSubmodule(path, url, { git });

    // Allow overriding of the checked-out version of the submodule.
    if (commitHash) {
      // Do the moral equivalent of submodule update when explicitly overriding.
      if (!fs.existsSync(submodule.path)) {
        await submodule.clone();
      }
      submodule.checkout(commitHash);
    } else {
      await submodule.init();
    }
  }

  const pjson = await fs.readFile(asset('../package.json'), 'utf-8');
  const pkg = JSON.parse(pjson);

  const platform = ModdableSDK.platforms[os.type()];
  if (!platform) {
    throw new Error(`Unsupported OS found: ${os.type()}`);
  }

  const make = makeCLI(platform.make || 'make', { spawn });
  for (const goal of ModdableSDK.buildGoals) {
    // eslint-disable-next-line no-await-in-loop
    await make.run(
      [
        `MODDABLE=${ModdableSDK.MODDABLE}`,
        `GOAL=${goal}`,
        `XSNAP_VERSION=${pkg.version}`,
      ],
      {
        cwd: `xsnap-native/xsnap/makefiles/${platform.path}`,
      },
    );
  }
}

main(process.argv.slice(2), {
  env: { ...process.env },
  stdout: process.stdout,
  spawn: childProcessTop.spawn,
  fs: {
    readFile: fsTop.promises.readFile,
    existsSync: fsTop.existsSync,
  },
  os: {
    type: osTop.type,
  },
}).catch(e => {
  console.error(e);
  process.exit(1);
});
