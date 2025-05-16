// sg-schema-sync.test-config.js
// Configuration for the 'test-tool' script in package.json
module.exports = {
  config: {
    packageConfig: {
      input: "https://petstore3.swagger.io/api/v3/openapi.json",
      outputDir: "./test-output-from-config", // CLI -o will override
      baseURL: "https://petstore3.swagger.io/api/v3",

      generateFunctions: true,
      generateHooks: true,

      useDefaultRequester: true,
      defaultRequesterConfig: {
        getTokenModulePath: "./src/helpers/dummyGetToken.ts", // Ensure this file exists
        getTokenExportName: "getToken",
      },
      generatedClientModuleBasename: "sgClient",

      formatWithPrettier: true,
      verbose: true,
    },
    requestConfig: {},
  },
};
