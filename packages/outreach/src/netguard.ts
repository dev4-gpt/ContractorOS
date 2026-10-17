/** The private-address guard now lives in @reforge/core so every package that fetches the web shares it. */
export { UnsafeHostError, assertPublicHost, defaultLookup, isPrivateAddress } from '@reforge/core';
export type { Lookup } from '@reforge/core';
