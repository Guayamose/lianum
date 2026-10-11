const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared schemas/client code and the portable hash live in production packages.
config.watchFolders = [
  path.resolve(__dirname, '../../packages/mobile-protocol'),
  path.resolve(__dirname, '../../packages/crypto'),
];
module.exports = config;
