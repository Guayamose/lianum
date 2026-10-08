/** Keep every Android CMake compile and link in one shared Ninja job pool. */
const { withAppBuildGradle, withProjectBuildGradle, createRunOncePlugin } = require('expo/config-plugins');

const NATIVE_CMAKE_ARGUMENTS = Object.freeze([
  '-DCMAKE_JOB_POOLS=owned_build=1',
  '-DCMAKE_JOB_POOL_COMPILE=owned_build',
  '-DCMAKE_JOB_POOL_LINK=owned_build',
]);
const quotedArguments = NATIVE_CMAKE_ARGUMENTS.map(argument => `'${argument}'`).join(', ');
const appBlock = `// BEGIN LIANUM NATIVE BUILD LIMITS
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments ${quotedArguments}
            }
        }
    }
}
// END LIANUM NATIVE BUILD LIMITS`;
const projectBlock = `// BEGIN LIANUM LIBRARY BUILD LIMITS
subprojects { subproject ->
    subproject.pluginManager.withPlugin('com.android.library') {
        subproject.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.arguments.addAll([
            ${quotedArguments}
        ])
    }
}
// END LIANUM LIBRARY BUILD LIMITS`;

function appendFixedBlock(contents, block, marker) {
  if (contents.includes(block)) return contents;
  if (contents.includes(marker)) throw new Error('MOBILE_NATIVE_BUILD_LIMITS_MARKER_CHANGED');
  return contents.trimEnd() + '\n\n' + block + '\n';
}

function applyAppBuildLimits(contents) {
  return appendFixedBlock(contents, appBlock, 'LIANUM NATIVE BUILD LIMITS');
}

function applyLibraryBuildLimits(contents) {
  return appendFixedBlock(contents, projectBlock, 'LIANUM LIBRARY BUILD LIMITS');
}

function withNativeBuildLimits(config, options) {
  if (options !== undefined && (options === null || typeof options !== 'object'
    || Array.isArray(options) || Object.keys(options).length !== 0)) {
    throw new Error('MOBILE_NATIVE_BUILD_LIMITS_NO_OPTIONS');
  }
  config = withAppBuildGradle(config, androidConfig => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('MOBILE_NATIVE_BUILD_LIMITS_GROOVY_REQUIRED');
    }
    androidConfig.modResults.contents = applyAppBuildLimits(androidConfig.modResults.contents);
    return androidConfig;
  });
  return withProjectBuildGradle(config, androidConfig => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('MOBILE_NATIVE_BUILD_LIMITS_GROOVY_REQUIRED');
    }
    androidConfig.modResults.contents = applyLibraryBuildLimits(androidConfig.modResults.contents);
    return androidConfig;
  });
}

module.exports = createRunOncePlugin(withNativeBuildLimits, 'lianum-native-build-limits', '1.0.0');
module.exports.NATIVE_CMAKE_ARGUMENTS = NATIVE_CMAKE_ARGUMENTS;
module.exports.applyAppBuildLimits = applyAppBuildLimits;
module.exports.applyLibraryBuildLimits = applyLibraryBuildLimits;
