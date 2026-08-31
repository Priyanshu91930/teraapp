const { withGradleProperties, withProjectBuildGradle } = require('@expo/config-plugins');

function withGradleProps(config) {
  return withGradleProperties(config, (config) => {
    // 1. Update existing kotlinVersion key if found
    config.modResults = config.modResults.map((item) => {
      if (item.key === 'kotlinVersion') {
        item.value = '2.3.0';
      }
      return item;
    });
    
    // 2. Insert kotlinVersion if it does not exist
    const hasKotlinVersion = config.modResults.some((item) => item.key === 'kotlinVersion');
    if (!hasKotlinVersion) {
      config.modResults.push({
        type: 'property',
        key: 'kotlinVersion',
        value: '2.3.0',
      });
    }
    
    return config;
  });
}

function withBuildGradlePlugin(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /kotlin-gradle-plugin'/g,
      "kotlin-gradle-plugin:2.3.0'"
    );
    config.modResults.contents = config.modResults.contents.replace(
      /kotlin-gradle-plugin"/g,
      'kotlin-gradle-plugin:2.3.0"'
    );
    return config;
  });
}

module.exports = function withKotlinVersion(config) {
  return withGradleProps(withBuildGradlePlugin(config));
};
