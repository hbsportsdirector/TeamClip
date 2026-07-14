const { withAppBuildGradle } = require("expo/config-plugins");

// Länkar in den vendrade ffmpeg-kit-AAR:en (vendor/ffmpeg-kit-full-gpl.aar)
// i appmodulen. Biblioteksmodulen (node_modules/ffmpeg-kit-react-native)
// kompilerar mot samma fil via compileOnly – se patches/-katalogen.
const GRADLE_SNIPPET = `
// ffmpeg-kit: vendrad binär ur repot (se vendor/CHECKSUMS.md)
repositories {
  flatDir { dirs "\${rootProject.projectDir}/../vendor" }
}
dependencies {
  implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
  implementation 'com.arthenica:smart-exception-java:0.2.1'
}
`;

module.exports = function withFfmpegAar(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("ffmpeg-kit-full-gpl")) {
      cfg.modResults.contents += GRADLE_SNIPPET;
    }
    return cfg;
  });
};
