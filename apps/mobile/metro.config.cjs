const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared schemas/client code and the portable hash live in production packages.
config.watchFolders = [
  path.resolve(__dirname, '../../packages/mobile-protocol'),
  path.resolve(__dirname, '../../packages/crypto'),
  // Portable signing dependencies are installed beside the shared crypto
  // package. Metro must see those files, including Solana's nested versions.
  ...['@noble/ciphers', '@noble/curves', '@noble/hashes', '@scure/base',
    '@scure/bip32', '@scure/bip39', '@scure/btc-signer', 'micro-eth-signer',
    'micro-key-producer', 'micro-packed', 'micro-sol-signer']
    .map(name => path.resolve(__dirname, '../../node_modules', name)),
];
module.exports = config;
