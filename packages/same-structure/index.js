// This entire package is now deprecated, with its code migrated
// to `@agoric/store` with the exports renamed to their modern
// names.
//
// This package remains for now in order to
// re-export the new names from `@agoric/store` under the old
// deprecated names that this package used to export. Please update
// uses to the new names as imported from `@agoric/marshal`.

export {
  sameKey as sameStructure,
  isKey as isComparable, // deprecated
  assertKey as mustBeComparable, // deprecated
  fulfillToKey as allComparable, // deprecated
} from '@agoric/store';
