// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';
import { QCLASS } from './marshal.js';

import './types.js';
import { getErrorConstructor } from './helpers/error.js';

const { ownKeys } = Reflect;
const { isArray } = Array;
const { stringify: quote } = JSON;

/**
 * @typedef {Object} Indenter
 * @property {(openBracket: string) => number} open
 * @property {() => number} line
 * @property {(token: string) => number} next
 * @property {(closeBracket: string) => number} close
 * @property {() => string} done
 */

/**
 * Generous whitespace for readability
 *
 * @returns {Indenter}
 */
const makeYesIndenter = () => {
  const strings = [];
  let level = 0;
  let needSpace = false;
  const line = () => {
    needSpace = false;
    return strings.push('\n', '  '.repeat(level));
  };
  return harden({
    open: openBracket => {
      level += 1;
      if (needSpace) {
        strings.push(' ');
      }
      needSpace = false;
      return strings.push(openBracket);
    },
    line,
    next: token => {
      if (needSpace && token !== ',') {
        strings.push(' ');
      }
      needSpace = true;
      return strings.push(token);
    },
    close: closeBracket => {
      assert(level >= 1);
      level -= 1;
      line();
      return strings.push(closeBracket);
    },
    done: () => {
      assert.equal(level, 0);
      return strings.join('');
    },
  });
};

/**
 * If the last character of one token together with the first character
 * of the next token matches this pattern, then the two tokens must be
 * separated by whitespace to preserve their meaning. Otherwise the
 * whitespace in unnecessary.
 *
 * The `<!` and `->` cases prevent the accidental formation of an
 * html-like comment. I don't think the double angle brackets are actually
 * needed but I haven't thought about it enough to remove them.
 */
const badPairPattern = /^(?:\w\w|<<|>>|\+\+|--|<!|->)$/;

/**
 * Minimum whitespace needed to preseve meaning.
 *
 * @returns {Indenter}
 */
const makeNoIndenter = () => {
  const strings = [];
  return harden({
    open: openBracket => strings.push(openBracket),
    line: () => strings.length,
    next: token => {
      if (strings.length >= 1) {
        const last = strings[strings.length - 1];
        if (last.length >= 1 && token.length >= 1) {
          const pair = `${last[last.length - 1]}${token[0]}`;
          if (badPairPattern.test(pair)) {
            strings.push(' ');
          }
        }
      }
      return strings.push(token);
    },
    close: closeBracket => {
      if (strings.length >= 1 && strings[strings.length - 1] === ',') {
        strings.pop();
      }
      return strings.push(closeBracket);
    },
    done: () => strings.join(''),
  });
};

const identPattern = /^[a-zA-Z]\w*$/;

/**
 * @param {Encoding} encoding
 * @param {boolean=} shouldIndent
 * @returns {string}
 */
const decodeToJustin = (encoding, shouldIndent = false) => {
  /**
   * The first pass does some input validation.
   * Its control flow should mirror `recur` as closely as possible
   * and the two should be maintained together. They must visit everything
   * in the same order.
   *
   * TODO now that ibids are gone, we should fold this back together into
   * one validating pass.
   *
   * @param {Encoding} rawTree
   * @returns {void}
   */
  const prepare = rawTree => {
    if (Object(rawTree) !== rawTree) {
      return;
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      assert.typeof(
        qclass,
        'string',
        X`invalid qclass typeof ${q(typeof qclass)}`,
      );
      assert(!isArray(rawTree));
      switch (rawTree['@qclass']) {
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          return;
        }
        case 'bigint': {
          const { digits } = rawTree;
          assert.typeof(
            digits,
            'string',
            X`invalid digits typeof ${q(typeof digits)}`,
          );
          return;
        }
        case '@@asyncIterator': {
          return;
        }
        case 'error': {
          const { name, message } = rawTree;
          assert.typeof(
            name,
            'string',
            X`invalid error name typeof ${q(typeof name)}`,
          );
          assert(
            getErrorConstructor(name) !== undefined,
            X`Must be the name of an Error constructor ${name}`,
          );
          assert.typeof(
            message,
            'string',
            X`invalid error message typeof ${q(typeof message)}`,
          );
          return;
        }
        case 'slot': {
          const { index, iface } = rawTree;
          assert.typeof(index, 'number');
          Nat(index);
          assert.typeof(iface, 'string');
          return;
        }
        case 'hilbert': {
          const { original, rest } = rawTree;
          assert(
            'original' in rawTree,
            X`Invalid Hilbert Hotel encoding ${rawTree}`,
          );
          prepare(original);
          if ('rest' in rawTree) {
            assert.typeof(
              rest,
              'object',
              X`Rest ${rest} encoding must be an object`,
            );
            assert(rest !== null, X`Rest ${rest} encoding must not be null`);
            assert(
              !isArray(rest),
              X`Rest ${rest} encoding must not be an array`,
            );
            assert(
              !(QCLASS in rest),
              X`Rest encoding ${rest} must not contain ${q(QCLASS)}`,
            );
            const names = ownKeys(rest);
            for (const name of names) {
              assert.typeof(
                name,
                'string',
                X`Property name ${name} of ${rawTree} must be a string`,
              );
              prepare(rest[name]);
            }
          }
          return;
        }

        default: {
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      for (let i = 0; i < length; i += 1) {
        prepare(rawTree[i]);
      }
    } else {
      const names = ownKeys(rawTree);
      for (const name of names) {
        assert.typeof(
          name,
          'string',
          X`Property name ${name} of ${rawTree} must be a string`,
        );
        prepare(rawTree[name]);
      }
    }
  };

  const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
  const out = makeIndenter();

  /**
   * This is the second pass recursion after the first pass `prepare`.
   * The first pass did some input validation so
   * here we can safely assume everything those things are validated.
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const decode = rawTree => {
    // eslint-disable-next-line no-use-before-define
    return recur(rawTree);
  };

  const decodeProperty = (name, value) => {
    out.line();
    if (name === '__proto__') {
      // JavaScript interprets `{__proto__: x, ...}`
      // as making an object inheriting from `x`, whereas
      // in JSON it is simply a property name. Preserve the
      // JSON meaning.
      out.next(`["__proto__"]:`);
    } else if (identPattern.test(name)) {
      out.next(`${name}:`);
    } else {
      out.next(`${quote(name)}:`);
    }
    decode(value);
    out.next(',');
  };

  /**
   * Modeled after `fullRevive` in marshal.js
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const recur = rawTree => {
    if (Object(rawTree) !== rawTree) {
      // primitives get quoted
      return out.next(quote(rawTree));
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      assert.typeof(qclass, 'string');
      assert(!isArray(rawTree));
      // Switching on `encoded[QCLASS]` (or anything less direct, like
      // `qclass`) does not discriminate rawTree in typescript@4.2.3 and
      // earlier.
      switch (rawTree['@qclass']) {
        // Encoding of primitives not handled by JSON
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          // Their qclass is their expression source.
          return out.next(qclass);
        }
        case 'bigint': {
          const { digits } = rawTree;
          return out.next(`${BigInt(digits)}n`);
        }
        case '@@asyncIterator': {
          return out.next('Symbol.asyncIterator');
        }

        case 'error': {
          const { name, message } = rawTree;
          return out.next(`${name}(${quote(message)})`);
        }

        case 'slot': {
          let { index, iface } = rawTree;
          index = Number(Nat(index));
          iface = quote(iface);
          return out.next(`getSlotVal(${index},${iface})`);
        }

        case 'hilbert': {
          const { original, rest } = rawTree;
          out.open('{');
          decodeProperty(QCLASS, original);
          if ('rest' in rawTree) {
            assert.typeof(rest, 'object');
            assert(rest !== null);
            const names = ownKeys(rest);
            for (const name of names) {
              decodeProperty(name, rest[name]);
            }
          }
          return out.close('}');
        }

        default: {
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      if (length === 0) {
        return out.next('[]');
      } else {
        out.open('[');
        for (let i = 0; i < length; i += 1) {
          out.line();
          decode(rawTree[i]);
          out.next(',');
        }
        return out.close(']');
      }
    } else {
      const names = ownKeys(rawTree);
      if (names.length === 0) {
        return out.next('{}');
      } else {
        out.open('{');
        for (const name of names) {
          decodeProperty(name, rawTree[name]);
        }
        return out.close('}');
      }
    }
  };
  prepare(encoding);
  decode(encoding);
  return out.done();
};
harden(decodeToJustin);
export { decodeToJustin };
