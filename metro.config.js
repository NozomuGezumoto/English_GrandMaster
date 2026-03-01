const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix for Firebase Auth "Component auth has not been registered yet" error
// (Expo SDK 53+ / React Native 0.79+ dual package hazard with Firebase)
config.resolver.unstable_enablePackageExports = false;
config.resolver.unstable_enableSymlinks = false;

module.exports = config;
