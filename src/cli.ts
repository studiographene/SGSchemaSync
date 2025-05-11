#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import path from "path";
import fs from "fs"; // Added for existsSync
import { runGenerator, GeneratorOptions as CoreGeneratorOptions } from "./index"; // Import core logic
import packageJson from "../package.json"; // Import for version
// import { clientConfig } from "./helpers/testconfig"; // Commented out or removed
import { ParserConfig } from "./parser"; // Added
import { PackageConfig, defaultPackageConfig } from "./config"; // Added for default

// Extend CoreGeneratorOptions for CLI specific flags
interface CliGeneratorOptions extends CoreGeneratorOptions {
  input?: string; // This can serve as a fallback or override for baseURL
  output: string; // Already requiredOption
  config?: string;
  prettier?: boolean; // Added for CLI control over Prettier
  prettierConfigPath?: string; // Added for CLI Prettier config path
  adapterPath?: string; // For customRequesterAdapterPath
  scaffoldAdapter?: boolean; // For scaffoldRequesterAdapter
  stripPathPrefix?: string; // New CLI option
}

const program = new Command();
const DEFAULT_CONFIG_FILENAME = "sg-schema-sync.config.js";

program
  .name("sg-schema-sync")
  .description(
    "CLI tool to generate type-safe API clients (Axios functions, types, optional TanStack Query hooks) from an OpenAPI v3 specification."
  )
  .version(packageJson.version); // Use version from package.json

program
  .option(
    "-i, --input <path_or_url>",
    "Path or URL to the OpenAPI JSON specification (can be overridden by config file's baseURL)"
  )
  .requiredOption("-o, --output <path>", "Output path for the generated TypeScript file (relative to CWD)")
  .option("--config <path>", `Path to a JavaScript configuration file (default: ${DEFAULT_CONFIG_FILENAME} in CWD)`)
  .option("--prettier / --no-prettier", "Enable or disable Prettier formatting (overrides config file setting)")
  .option(
    "--prettier-config-path <path>",
    "Path to a custom Prettier configuration file (overrides config file setting)"
  )
  .option(
    "--adapter-path <path>",
    "Path for the custom requester adapter file (e.g., src/api/sgClientSetup.ts). Used if useDefaultRequester is false."
  )
  .option(
    "--scaffold-adapter / --no-scaffold-adapter",
    "Enable or disable scaffolding of the custom requester adapter file if it doesn\'t exist. Used if useDefaultRequester is false."
  )
  .option(
    "--strip-path-prefix <prefix>",
    "A string prefix to strip from the beginning of all paths from the OpenAPI spec (e.g., /api)"
  );

program.parse(process.argv);

// Use the extended options type here
const options = program.opts<CliGeneratorOptions>();

let userConfig: ParserConfig = {};
let effectiveConfigPath: string | undefined = options.config;

if (!effectiveConfigPath) {
  const defaultConfigPath = path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);
  if (fs.existsSync(defaultConfigPath)) {
    console.log(`No --config specified, found default config file: ${defaultConfigPath}`);
    effectiveConfigPath = defaultConfigPath; // Use default path
  } else {
    console.log(`No --config specified and no default '${DEFAULT_CONFIG_FILENAME}' found in CWD.`);
  }
}

if (effectiveConfigPath) {
  try {
    // Ensure effectiveConfigPath is absolute if it came from default discovery
    // If it came from options.config, path.resolve will also make it absolute or handle it if already absolute.
    const absoluteConfigPath = path.resolve(process.cwd(), effectiveConfigPath);
    const loadedConfigModule = require(absoluteConfigPath);
    if (loadedConfigModule && loadedConfigModule.config) {
      userConfig = loadedConfigModule.config as ParserConfig;
      console.log(`Loaded configuration from: ${absoluteConfigPath}`);
    } else {
      console.error(`Error: Configuration file at '${absoluteConfigPath}' must export a 'config' object.`);
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`Error loading configuration file '${effectiveConfigPath}': ${e.message}`);
    process.exit(1);
  }
}

// Merge packageConfig from file with defaults, potentially overridden by input
const finalPackageConfig: Partial<PackageConfig> = {
  ...defaultPackageConfig, // Start with defaults
  ...userConfig.packageConfig, // Apply config file's packageConfig
};

// If options.input is provided, it can be used as baseURL if not in config
if (options.input) {
  if (!finalPackageConfig.baseURL) {
    console.log(`Using baseURL from --input: ${options.input}`);
    finalPackageConfig.baseURL = options.input;
  } else {
    console.log(
      `Using baseURL from config file: ${finalPackageConfig.baseURL}. (--input '${options.input}' is ignored for baseURL when config provides it).`
    );
  }
}

// Override Prettier settings from CLI if provided
if (options.prettier !== undefined) {
  finalPackageConfig.formatWithPrettier = options.prettier;
  console.log(`Prettier formatting ${options.prettier ? "enabled" : "disabled"} via CLI.`);
}
if (options.prettierConfigPath !== undefined) {
  finalPackageConfig.prettierConfigPath = options.prettierConfigPath;
  console.log(`Using Prettier config path from CLI: ${options.prettierConfigPath}`);
}

// Override Adapter settings from CLI if provided
if (options.adapterPath !== undefined) {
  finalPackageConfig.customRequesterAdapterPath = options.adapterPath;
  console.log(`Custom requester adapter path set via CLI: ${options.adapterPath}`);
}
if (options.scaffoldAdapter !== undefined) {
  finalPackageConfig.scaffoldRequesterAdapter = options.scaffoldAdapter;
  console.log(`Scaffolding for custom requester adapter ${options.scaffoldAdapter ? "enabled" : "disabled"} via CLI.`);
}

// Override stripPathPrefix from CLI if provided
if (options.stripPathPrefix !== undefined) {
  finalPackageConfig.stripPathPrefix = options.stripPathPrefix;
  if (options.stripPathPrefix === "") {
    // Handle case where user provides an empty string to effectively unset it
    finalPackageConfig.stripPathPrefix = undefined;
    console.log(`Path prefix stripping disabled via CLI (empty prefix).`);
  } else {
    console.log(`Path prefix to strip set via CLI: "${options.stripPathPrefix}"`);
  }
}

// Validate that either input URL/path or a baseURL from config is provided
if (!finalPackageConfig.baseURL) {
  console.error(
    "Error: A baseURL must be provided either via the --input option, a config file, or the default 'sg-schema-sync.config.js'."
  );
  process.exit(1);
}

// Prepare the generator options
// The CoreGeneratorOptions interface will need to be updated to accept ParserConfig
// For now, let's assume CoreGeneratorOptions is updated like this:
// export interface GeneratorOptions {
//   output: string;
//   reactQuery?: boolean;
//   parserConfig: ParserConfig;
// }

const generatorOptions: CoreGeneratorOptions = {
  output: options.output,
  // reactQuery is now determined by packageConfig.generateHooks
  // The GeneratorOptions interface still expects reactQuery, so we derive it.
  reactQuery: finalPackageConfig.generateHooks,
  parserConfig: {
    packageConfig: finalPackageConfig,
    requestConfig: userConfig.requestConfig || {}, // Use requestConfig from file or default to empty
  },
};

runGenerator(generatorOptions).catch((error) => {
  process.exit(1);
});
