// jsdom does not expose TextEncoder/TextDecoder on the global, but `jose` (a
// transitive dependency of @nebulr-group/bridge-auth-core) reads them at module
// scope. Node has had them for years — just hand them over. No-op under the
// default `node` test environment, which already has both.
const { TextEncoder, TextDecoder } = require('node:util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}
// Same story for WebCrypto, which jose reaches for when it verifies a JWT.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('node:crypto').webcrypto;
}
