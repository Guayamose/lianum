const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared schemas/client code and the portable hash live in production packages.
config.watchFolders = [
  path.resolve(__dirname, '../../packages/mobile-protocol'),
  path.resolve(__dirname, '../../packages/crypto'),
  path.resolve(__dirname, '../../packages/sdk'),
  // Portable signing dependencies are installed beside the shared crypto
  // package. Metro must see those files, including Solana's nested versions.
  ...['@noble/ciphers', '@noble/curves', '@noble/hashes', '@scure/base',
    '@scure/bip32', '@scure/bip39', '@scure/btc-signer', 'micro-eth-signer',
    'micro-key-producer', 'micro-packed', 'micro-sol-signer']
    .map(name => path.resolve(__dirname, '../../node_modules', name)),
];
// Shared SDK files resolve the same workspace packages as files in the app.
// Explicit roots also avoid following the host runtime's development aliases.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ...Object.fromEntries(['mobile-protocol', 'crypto', 'sdk'].map(name =>
    ['@lianum/' + name, path.resolve(__dirname, '../../packages', name)])),
};
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];
// Same adapter as the original Lianum frontend. ECharts pins tslib 2.3,
// whose default-import wrapper fails during native Metro initialization.
// Use the directly exported helpers from the explicit current dependency.
const tslibModule = require.resolve('tslib/tslib.es6.mjs');
const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName === 'tslib' ? tslibModule : moduleName;
  return priorResolveRequest
    ? priorResolveRequest(context, name, platform)
    : context.resolveRequest(context, name, platform);
};
module.exports = config;
