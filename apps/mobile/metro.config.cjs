const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Watch only the shared protocol, not restoration archives or native labs.
config.watchFolders = [path.resolve(__dirname, '../../packages/mobile-protocol')];
module.exports = config;
