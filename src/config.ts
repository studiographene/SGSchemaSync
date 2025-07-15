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
  /**
   * Template for generated function names (e.g., "{method}{Endpoint}").
   * @default "{method}{Endpoint}"
   */
  generateFunctionNames?: string;
  /**
   * Template for generated type names (e.g., "{Method}{Endpoint}Types").
   * @default "{Method}{Endpoint}Types"
   */
  generateTypesNames?: string;
  /**
   * Template for generated hook names (e.g., "use{Method}{Endpoint}").
   * @default "use{Method}{Endpoint}"
   */
  generateHooksNames?: string;
  /**
   * Optional string prefix to strip from the beginning of all paths obtained from the OpenAPI specification.
   * This affects runtime request paths and can influence generated names like hook names or query keys.
   * Type names will still use the original, unstripped path.
   * @default undefined
   */
  stripPathPrefix?: string;
  /**
   * When `useDefaultRequester` is `false`, if this is `true` (the default) and the custom requester file
   * (specified by `customRequesterConfig.filePath`) does not exist, the tool will generate a basic scaffold for it.
   * Set to `false` to prevent scaffold generation.
   * @default true
   */
  scaffoldRequesterAdapter?: boolean;
  /**
   * Enable verbose logging output.
   * @default false
   */
  verbose?: boolean;

  /**
   * Optional prefix added to every OPERATION-specific type generated (Request/Response/Parameters).
   * Provide a short PascalCase string. If omitted, no prefix is applied (back-compat behaviour).
   */
  operationTypePrefix?: string;

  /**
   * Prefix added to every auxiliary schema type generated from $ref references.
   * Defaults to "SSGEN_" to avoid collisions in mono-repos.
   */
  schemaTypePrefix?: string;
}

/**
 * Represents the fully resolved configuration after defaults have been applied.
 */
export interface ResolvedPackageConfig
  extends Omit<
    PackageConfig,
    // Properties that have different types or are made required in ResolvedPackageConfig
    | "defaultRequesterConfig"
    | "customRequesterConfig"
    | "useDefaultRequester"
    | "generatedClientModuleBasename"
    | "formatWithPrettier"
    | "timeout"
    | "generateHooks"
    | "generateFunctions"
    // `scaffoldRequesterAdapter` is optional and carries over, no need to list in Omit
    // `verbose` is optional and carries over, no need to list in Omit
  > {
  input: string | Record<string, any>; // Required
  outputDir: string; // Required
  baseURL?: string;
  headers?: Record<string, string>;
  useDefaultRequester: boolean; // Required, default applied
  defaultRequesterConfig?: Required<DefaultRequesterConfig>; // Made Required if useDefaultRequester is true
  customRequesterConfig: Required<CustomRequesterConfig>; // Made Required
  generatedClientModuleBasename: string; // Required, default applied
  formatWithPrettier: boolean; // Required, default applied
  prettierConfigPath?: string;
  timeout: number; // Required, default applied
  generateHooks: boolean; // Required, default applied
  generateFunctions: boolean; // Required, default applied
  // New properties from PackageConfig, carried over (optional)
  generateFunctionNames?: string;
  generateTypesNames?: string;
  generateHooksNames?: string;
  stripPathPrefix?: string;
  scaffoldRequesterAdapter: boolean; // Required in Resolved, default applied
  verbose: boolean; // Required in Resolved, default applied

  operationTypePrefix?: string;
  schemaTypePrefix: string; // Always resolved, default may apply
}

// Helper function to load and resolve configuration (conceptual)
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
    ...defaultConfig, // Start with internal defaults
    ...userConfig, // Layer user config file
    ...cliOptions, // CLI options take highest precedence
  };

  // Apply defaults and resolve
  const outputDir = mergedConfig.outputDir || "./src/api"; // Should have been set by defaultConfig
  const useDefaultRequester = mergedConfig.useDefaultRequester ?? false;
  const generatedClientModuleBasename = mergedConfig.generatedClientModuleBasename ?? "client";
  const formatWithPrettier = mergedConfig.formatWithPrettier ?? true;
  const timeout = mergedConfig.timeout ?? 10000;
  const generateHooks = mergedConfig.generateHooks ?? true;
  const generateFunctions = mergedConfig.generateFunctions ?? true;
  const scaffoldRequesterAdapter = mergedConfig.scaffoldRequesterAdapter ?? true; // Default to true
  const verbose = mergedConfig.verbose ?? false; // Default to false

  // Resolve new naming and path stripping properties, falling back to defaults from defaultConfig
  const generateFunctionNames = mergedConfig.generateFunctionNames ?? defaultConfig.generateFunctionNames;
  const generateTypesNames = mergedConfig.generateTypesNames ?? defaultConfig.generateTypesNames;
  const generateHooksNames = mergedConfig.generateHooksNames ?? defaultConfig.generateHooksNames;
  const stripPathPrefix = mergedConfig.stripPathPrefix ?? defaultConfig.stripPathPrefix;

  const operationTypePrefix = mergedConfig.operationTypePrefix ?? defaultConfig.operationTypePrefix;
  const schemaTypePrefix = mergedConfig.schemaTypePrefix ?? defaultConfig.schemaTypePrefix ?? "SSGEN_";

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
    filePath:
      mergedConfig.customRequesterConfig?.filePath ??
      defaultConfig.customRequesterConfig?.filePath ??
      "./sg-requester.ts",
    exportName:
      mergedConfig.customRequesterConfig?.exportName ??
      defaultConfig.customRequesterConfig?.exportName ??
      "SchemaSyncRequester",
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
    // Add new resolved properties
    generateFunctionNames,
    generateTypesNames,
    generateHooksNames,
    stripPathPrefix,
    scaffoldRequesterAdapter,
    verbose,
    // Conditionally required
    ...(useDefaultRequester &&
      resolvedDefaultRequesterConfig && { defaultRequesterConfig: resolvedDefaultRequesterConfig }),
    operationTypePrefix,
    schemaTypePrefix,
  } as ResolvedPackageConfig;
}

// Default configuration
export const defaultConfig: Partial<PackageConfig> = {
  // No 'input' here, as it's required from the user (CLI or config file)
  outputDir: "./src/api",
  useDefaultRequester: false,
  generatedClientModuleBasename: "client",
  formatWithPrettier: true,
  timeout: 10000,
  generateHooks: true,
  generateFunctions: true,
  generateFunctionNames: "{method}{Endpoint}",
  generateTypesNames: "{Method}{Endpoint}Types",
  generateHooksNames: "use{Method}{Endpoint}",
  scaffoldRequesterAdapter: true, // Default for scaffolding custom adapter
  verbose: false, // Default for verbose
  customRequesterConfig: {
    filePath: "schema-sync-requester.ts",
    exportName: "SchemaSyncRequester",
  },
  // defaultRequesterConfig is not set here as it depends on useDefaultRequester being true
  // and getTokenModulePath would be required.

  // New prefix defaults
  schemaTypePrefix: "SSGEN_", // default applied to schema-derived types
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
