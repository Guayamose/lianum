const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// The DeFi protocol shares the original pure position validator with the web wallet.
config.watchFolders = [
  path.resolve(__dirname, '../../packages/mobile-protocol'),
  path.resolve(__dirname, '../wallet/src/client/features/portfolio'),
];
module.exports = config;
