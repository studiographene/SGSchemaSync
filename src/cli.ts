#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import path from "path";
import fs from "fs";
import { runGenerator, GeneratorOptions as CoreGeneratorOptions } from "./index";
import packageJson from "../package.json";
import {
  PackageConfig,
  ResolvedPackageConfig,
  defaultConfig as baseDefaultConfig, // Renamed to avoid confusion
} from "./config";

const program = new Command();
const DEFAULT_CONFIG_FILENAME = "sg-schema-sync.config.js";

// Define hardcoded defaults for specific nested properties formerly in defaultConfig
const DEFAULT_GET_TOKEN_EXPORT_NAME = "getToken";
const DEFAULT_CUSTOM_REQUESTER_FILE_PATH = "./sg-requester.ts";
const DEFAULT_CUSTOM_REQUESTER_EXPORT_NAME = "SchemaSyncRequester";

interface CliOptions extends Partial<Omit<PackageConfig, "defaultRequesterConfig" | "customRequesterConfig">> {
  config?: string;
  output: string;
  prettier?: boolean;

  getTokenModulePath?: string;
  getTokenExportName?: string;
  customRequesterPath?: string;
  customRequesterExportName?: string;
}

program
  .name("sg-schema-sync")
  .description("CLI tool to generate type-safe API clients from an OpenAPI v3 specification.")
  .version(packageJson.version);

program
  .option(
    "-i, --input <path_or_url>",
    "Path or URL to the OpenAPI JSON specification. Overrides 'input' in config file."
  )
  .requiredOption(
    "-o, --output <path>",
    "Output directory for the generated files. Overrides 'outputDir' in config file."
  )
  .option("--config <path>", `Path to a JavaScript configuration file (default: ${DEFAULT_CONFIG_FILENAME} in CWD).`)
  .option("--baseURL <url>", "Base URL for the API. Overrides 'baseURL' in config file.")
  .option("--timeout <milliseconds>", "Request timeout in milliseconds. Overrides 'timeout' in config file.", parseInt)
  .option(
    "--use-default-requester [boolean]",
    "Use the default requester (axios/fetch based). Overrides 'useDefaultRequester' in config file.",
    (val) => val !== "false"
  )
  .option(
    "--get-token-module-path <path>",
    "Path to the module exporting 'getToken' for the default requester. Overrides 'defaultRequesterConfig.getTokenModulePath'."
  )
  .option(
    "--get-token-export-name <name>",
    `Export name for 'getToken' function (default: "${DEFAULT_GET_TOKEN_EXPORT_NAME}"). Overrides 'defaultRequesterConfig.getTokenExportName'.`
  )
  .option(
    "--custom-requester-path <path>",
    `Path to your custom requester module (default: "${DEFAULT_CUSTOM_REQUESTER_FILE_PATH}"). Overrides 'customRequesterConfig.filePath'.`
  )
  .option(
    "--custom-requester-export-name <name>",
    `Export name for your custom requester (default: "${DEFAULT_CUSTOM_REQUESTER_EXPORT_NAME}"). Overrides 'customRequesterConfig.exportName'.`
  )
  .option(
    "--generated-client-module-basename <name>",
    "Basename for the auto-generated client module (e.g., 'client' -> user/client.ts). Overrides 'generatedClientModuleBasename'."
  )
  .option(
    "--prettier [boolean]",
    "Enable or disable Prettier formatting. Overrides 'formatWithPrettier' in config file.",
    (val) => val !== "false"
  )
  .option(
    "--prettier-config-path <path>",
    "Path to a custom Prettier configuration file. Overrides 'prettierConfigPath'."
  )
  .option(
    "--generate-hooks [boolean]",
    "Generate React Query hooks. Overrides 'generateHooks' in config file.",
    (val) => val !== "false"
  )
  .option(
    "--generate-functions [boolean]",
    "Generate API client functions. Overrides 'generateFunctions' in config file.",
    (val) => val !== "false"
  );

program.parse(process.argv);
const cliArgs = program.opts<CliOptions>();

async function main() {
  let userConfigFromFile: Partial<PackageConfig> = {};
  let effectiveConfigPath: string | undefined = cliArgs.config;

  if (!effectiveConfigPath) {
    const defaultConfigPathInCwd = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);
    if (fs.existsSync(defaultConfigPathInCwd)) {
      console.log(`No --config specified, found default config file: ${defaultConfigPathInCwd}`);
      effectiveConfigPath = defaultConfigPathInCwd;
    } else {
      console.log(`No --config specified and no default '${DEFAULT_CONFIG_FILENAME}' found in CWD.`);
    }
  }

  if (effectiveConfigPath) {
    try {
      const absoluteConfigPath = path.resolve(process.cwd(), effectiveConfigPath);
      const loadedModule = await import(absoluteConfigPath).catch(async (err) => {
        if (
          err.code === "ERR_MODULE_NOT_FOUND" ||
          err.message?.includes("Cannot use import statement outside a module")
        ) {
          return require(absoluteConfigPath);
        }
        throw err;
      });

      if (loadedModule && (loadedModule.config || loadedModule.default)) {
        userConfigFromFile = (loadedModule.config || loadedModule.default) as Partial<PackageConfig>;
        console.log(`Loaded configuration from: ${absoluteConfigPath}`);
      } else {
        console.error(
          `Error: Configuration file at '${absoluteConfigPath}' must export a 'config' object or have a default export.`
        );
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`Error loading configuration file '${effectiveConfigPath}': ${e.message}`);
      process.exit(1);
    }
  }

  let mergedConfig: Partial<PackageConfig> = { ...baseDefaultConfig }; // Start with base defaults
  mergedConfig = { ...mergedConfig, ...userConfigFromFile }; // Merge with file config

  // Merge CLI arguments (highest precedence)
  if (cliArgs.input !== undefined) mergedConfig.input = cliArgs.input;
  mergedConfig.outputDir = cliArgs.output; // output is requiredOption
  if (cliArgs.baseURL !== undefined) mergedConfig.baseURL = cliArgs.baseURL;
  if (cliArgs.timeout !== undefined) mergedConfig.timeout = cliArgs.timeout;
  if (cliArgs.useDefaultRequester !== undefined) mergedConfig.useDefaultRequester = cliArgs.useDefaultRequester;
  if (cliArgs.generatedClientModuleBasename !== undefined)
    mergedConfig.generatedClientModuleBasename = cliArgs.generatedClientModuleBasename;
  if (cliArgs.prettier !== undefined) mergedConfig.formatWithPrettier = cliArgs.prettier;
  if (cliArgs.prettierConfigPath !== undefined) mergedConfig.prettierConfigPath = cliArgs.prettierConfigPath;
  if (cliArgs.generateHooks !== undefined) mergedConfig.generateHooks = cliArgs.generateHooks;
  if (cliArgs.generateFunctions !== undefined) mergedConfig.generateFunctions = cliArgs.generateFunctions;

  // Handle nested defaultRequesterConfig
  const getTokenModulePathFromFile = userConfigFromFile.defaultRequesterConfig?.getTokenModulePath;
  const getTokenExportNameFromFile = userConfigFromFile.defaultRequesterConfig?.getTokenExportName;

  // getTokenModulePath can be undefined at this stage. It's validated later.
  const tempGetTokenModulePath = cliArgs.getTokenModulePath ?? getTokenModulePathFromFile;
  const tempGetTokenExportName =
    cliArgs.getTokenExportName ?? getTokenExportNameFromFile ?? DEFAULT_GET_TOKEN_EXPORT_NAME;

  if (
    tempGetTokenModulePath !== undefined ||
    tempGetTokenExportName !== DEFAULT_GET_TOKEN_EXPORT_NAME ||
    userConfigFromFile.defaultRequesterConfig
  ) {
    mergedConfig.defaultRequesterConfig = {
      getTokenModulePath: tempGetTokenModulePath, // This is string | undefined
      getTokenExportName: tempGetTokenExportName,
    };
  }

  // Handle nested customRequesterConfig
  const customRequesterFilePathFromFile = userConfigFromFile.customRequesterConfig?.filePath;
  const customRequesterExportNameFromFile = userConfigFromFile.customRequesterConfig?.exportName;

  mergedConfig.customRequesterConfig = {
    filePath: cliArgs.customRequesterPath ?? customRequesterFilePathFromFile ?? DEFAULT_CUSTOM_REQUESTER_FILE_PATH,
    exportName:
      cliArgs.customRequesterExportName ?? customRequesterExportNameFromFile ?? DEFAULT_CUSTOM_REQUESTER_EXPORT_NAME,
  };

  // --- Resolve configuration (Applying final defaults from baseDefaultConfig and validating) ---
  if (!mergedConfig.input) {
    console.error("Error: 'input' (OpenAPI spec path or object) is required. Provide via --input or in config file.");
    process.exit(1);
  }

  const resolvedPackageConfig: ResolvedPackageConfig = {
    input: mergedConfig.input,
    outputDir: mergedConfig.outputDir!, // Already validated by commander
    baseURL: mergedConfig.baseURL,
    headers: mergedConfig.headers,
    useDefaultRequester: mergedConfig.useDefaultRequester ?? baseDefaultConfig.useDefaultRequester!,
    customRequesterConfig: {
      filePath: mergedConfig.customRequesterConfig!.filePath!, // Now guaranteed by above merge logic
      exportName: mergedConfig.customRequesterConfig!.exportName!, // Now guaranteed
    },
    generatedClientModuleBasename:
      mergedConfig.generatedClientModuleBasename ?? baseDefaultConfig.generatedClientModuleBasename!,
    formatWithPrettier: mergedConfig.formatWithPrettier ?? baseDefaultConfig.formatWithPrettier!,
    prettierConfigPath: mergedConfig.prettierConfigPath,
    timeout: mergedConfig.timeout ?? baseDefaultConfig.timeout!,
    generateHooks: mergedConfig.generateHooks ?? baseDefaultConfig.generateHooks!,
    generateFunctions: mergedConfig.generateFunctions ?? baseDefaultConfig.generateFunctions!,
    defaultRequesterConfig: undefined, // Initialize, will be set if useDefaultRequester is true
  };

  if (resolvedPackageConfig.useDefaultRequester) {
    const finalGetTokenModulePath = mergedConfig.defaultRequesterConfig?.getTokenModulePath;
    if (!finalGetTokenModulePath) {
      console.error(
        "Error: 'defaultRequesterConfig.getTokenModulePath' is required when 'useDefaultRequester' is true. Provide via --get-token-module-path or in config file."
      );
      process.exit(1);
    }
    resolvedPackageConfig.defaultRequesterConfig = {
      getTokenModulePath: finalGetTokenModulePath,
      getTokenExportName: mergedConfig.defaultRequesterConfig!.getTokenExportName!, // Guaranteed by merge logic
    };
  }

  // The GeneratorOptions (CoreGeneratorOptions) interface in src/index.ts
  // has been updated to { packageConfig: ResolvedPackageConfig, requestConfig: RequestConfig }
  // So, this structure should now match directly.
  const generatorOptions: CoreGeneratorOptions = {
    packageConfig: resolvedPackageConfig,
    requestConfig: {
      baseURL: resolvedPackageConfig.baseURL,
      timeout: resolvedPackageConfig.timeout,
      headers: resolvedPackageConfig.headers,
    },
  };

  try {
    await runGenerator(generatorOptions);
    console.log(`API client generated successfully in ${resolvedPackageConfig.outputDir}`);
  } catch (error: any) {
    console.error(`Error during code generation: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Unhandled error in CLI: ${e.message}`);
  process.exit(1);
});
