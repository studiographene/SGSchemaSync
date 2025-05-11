// Package configuration for code generation
export interface OpenAPIParserConfig {
  input: string | Record<string, any>; // Path to OpenAPI spec or the spec object itself
  outputDir: string;
  // ... other existing fields from BaseParserConfig if any ...
}

export interface DefaultRequesterConfig {
  /**
   * Path to the module (relative to project root) that exports your getToken function.
   * Required if useDefaultRequester is true.
   * Example: './src/auth/getToken'
   */
  getTokenModulePath: string;
  /**
   * The named export for your getToken function from the getTokenModulePath.
   * @default 'getToken'
   */
  getTokenExportName?: string;
}

export interface CustomRequesterConfig {
  /**
   * Path to your custom requester module (relative to project root).
   * This file should export a function conforming to the SGSyncRequester type.
   * If this file doesn't exist, sg-schema-sync will generate a scaffold for it.
   * @default './sg-requester.ts'
   */
  filePath?: string;
  /**
   * The named export for your SGSyncRequester implementation from the filePath.
   * This is the function sg-schema-sync will import and use.
   * @default 'SchemaSyncRequester'
   */
  exportName?: string;
}

export interface PackageConfig {
  /**
   * Path to the OpenAPI specification file (URL or local path) or the spec object itself.
   */
  input: string | Record<string, any>;
  /**
   * Output directory for the generated files.
   */
  outputDir: string;
  /**
   * Base URL for the API. Can be overridden by the OpenAPI spec's server URL.
   */
  baseURL?: string;
  /**
   * Request timeout in milliseconds.
   * @default 10000
   */
  timeout?: number;
  /**
   * Global headers to be sent with every request.
   */
  headers?: Record<string, string>;
  /**
   * Determines whether to use the default sg-schema-sync requester (based on Axios/Fetch)
   * or a custom requester implementation.
   * @default false (meaning a custom requester is expected)
   */
  useDefaultRequester?: boolean;
  /**
   * Configuration for the default requester.
   * Required if `useDefaultRequester` is true.
   * Changed to Partial<DefaultRequesterConfig> to allow intermediate undefined getTokenModulePath
   */
  defaultRequesterConfig?: Partial<DefaultRequesterConfig>;
  /**
   * Configuration for your custom requester.
   * Used if `useDefaultRequester` is false.
   */
  customRequesterConfig?: CustomRequesterConfig;
  /**
   * Suffix for the auto-generated "quick start" client file if `useDefaultRequester` is true.
   * @deprecated This will be replaced by generatedClientModuleBasename
   */
  defaultClientFileSuffix?: string;
  /**
   * Basename for the auto-generated client module within each tag's output directory.
   * This file orchestrates imports and instantiates API functions/hooks. It will be overwritten on each run.
   * Example: 'client' will result in files like `src/api/user/client.ts`.
   * @default 'client'
   */
  generatedClientModuleBasename?: string;
  /**
   * Whether to format the generated code using Prettier.
   * @default true
   */
  formatWithPrettier?: boolean;
  /**
   * Path to a custom Prettier configuration file.
   * If not provided, Prettier will attempt to find a configuration file automatically.
   */
  prettierConfigPath?: string;
  /**
   * Option to generate React Query hooks.
   * @default true
   */
  generateHooks?: boolean;
  /**
   * Option to generate API client functions.
   * @default true
   */
  generateFunctions?: boolean;
}

/**
 * Represents the fully resolved configuration after defaults have been applied.
 */
export interface ResolvedPackageConfig
  extends Omit<
    PackageConfig,
    | "defaultRequesterConfig"
    | "customRequesterConfig"
    | "useDefaultRequester"
    | "generatedClientModuleBasename"
    | "formatWithPrettier"
    | "timeout"
    | "generateHooks"
    | "generateFunctions"
  > {
  input: string | Record<string, any>;
  outputDir: string;
  baseURL?: string;
  headers?: Record<string, string>;
  useDefaultRequester: boolean;
  defaultRequesterConfig?: Required<DefaultRequesterConfig>;
  customRequesterConfig: Required<CustomRequesterConfig>;
  generatedClientModuleBasename: string;
  formatWithPrettier: boolean;
  prettierConfigPath?: string;
  timeout: number;
  generateHooks: boolean;
  generateFunctions: boolean;
}

// Helper function to load and resolve configuration (conceptual)
// You would implement this in your CLI or main orchestrator
export async function loadAndResolveConfig(
  configPath?: string,
  cliOptions: Partial<PackageConfig> = {}
): Promise<ResolvedPackageConfig> {
  let userConfig: Partial<PackageConfig> = {};
  if (configPath) {
    // In a real scenario, you'd load the .js config file here
    // For example: userConfig = (await import(resolve(process.cwd(), configPath))).config;
    // This is a placeholder:
    console.log(`Simulating loading config from: ${configPath}`);
    // userConfig = { baseURL: 'from-file' }; // Example
  }

  const mergedConfig: Partial<PackageConfig> = {
    ...userConfig,
    ...cliOptions, // CLI options take precedence
  };

  // Apply defaults and resolve
  const outputDir = mergedConfig.outputDir || "./src/api"; // Default outputDir
  const useDefaultRequester = mergedConfig.useDefaultRequester ?? false;
  const generatedClientModuleBasename = mergedConfig.generatedClientModuleBasename ?? "client";
  const formatWithPrettier = mergedConfig.formatWithPrettier ?? true;
  const timeout = mergedConfig.timeout ?? 10000;
  const generateHooks = mergedConfig.generateHooks ?? true;
  const generateFunctions = mergedConfig.generateFunctions ?? true;

  let resolvedDefaultRequesterConfig: Required<DefaultRequesterConfig> | undefined = undefined;
  if (useDefaultRequester) {
    if (!mergedConfig.defaultRequesterConfig?.getTokenModulePath) {
      throw new Error(
        "Configuration error: 'defaultRequesterConfig.getTokenModulePath' is required when 'useDefaultRequester' is true."
      );
    }
    resolvedDefaultRequesterConfig = {
      getTokenModulePath: mergedConfig.defaultRequesterConfig.getTokenModulePath,
      getTokenExportName: mergedConfig.defaultRequesterConfig.getTokenExportName ?? "getToken",
    };
  }

  const resolvedCustomRequesterConfig: Required<CustomRequesterConfig> = {
    filePath: mergedConfig.customRequesterConfig?.filePath ?? "./sg-requester.ts",
    exportName: mergedConfig.customRequesterConfig?.exportName ?? "SchemaSyncRequester",
  };

  if (!mergedConfig.input) {
    throw new Error("Configuration error: 'input' (OpenAPI spec path or object) is required.");
  }

  return {
    // Required fields
    input: mergedConfig.input,
    outputDir,
    useDefaultRequester,
    customRequesterConfig: resolvedCustomRequesterConfig,
    generatedClientModuleBasename,
    formatWithPrettier,
    timeout,
    generateHooks,
    generateFunctions,
    // Optional fields that carry over
    baseURL: mergedConfig.baseURL,
    headers: mergedConfig.headers,
    prettierConfigPath: mergedConfig.prettierConfigPath,
    // Conditionally required
    ...(useDefaultRequester &&
      resolvedDefaultRequesterConfig && { defaultRequesterConfig: resolvedDefaultRequesterConfig }),
  };
}

// Default configuration (if you have one, ensure it aligns or remove if loadAndResolveConfig handles all defaults)
export const defaultConfig: Partial<PackageConfig> = {
  outputDir: "./src/api",
  useDefaultRequester: false,
  generatedClientModuleBasename: "client",
  formatWithPrettier: true,
  timeout: 10000,
  generateHooks: true,
  generateFunctions: true,
  customRequesterConfig: {
    filePath: "./sg-requester.ts",
    exportName: "SchemaSyncRequester",
  },
};

// Base configuration combining parser and package settings
export interface GeneratorOptions extends OpenAPIParserConfig {
  packageConfig: ResolvedPackageConfig; // Now using ResolvedPackageConfig
  requestConfig: {
    // This structure might need review based on how it's used by the default requester
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
  };
}
