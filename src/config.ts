// Package configuration for code generation
export interface PackageConfig {
  generateFunctions: boolean;
  generateHooks: boolean;
  generateFunctionNames: string;
  generateTypesNames: string;
  generateHooksNames: string;
  baseDir: string;
  baseURL: string;
  useDefaultRequester?: boolean;
  defaultClientFileSuffix?: string;
}

// Default package configuration
export const defaultPackageConfig: PackageConfig = {
  generateFunctions: true,
  generateHooks: true,
  generateFunctionNames: "{method}{Endpoint}",
  generateTypesNames: "{Method}{Endpoint}Types",
  generateHooksNames: "use{Method}{Endpoint}",
  baseDir: "test-output/api/config-test",
  // Default to empty string - should be overridden by client configuration
  baseURL: "",
  useDefaultRequester: false,
  defaultClientFileSuffix: "sgClient.ts",
};

// Example of how to use this in a client project:
/*
// config.ts in client project
import { PackageConfig } from 'your-package-name';

export const clientConfig: Partial<PackageConfig> = {
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  generateFunctionNames: "custom{Method}{Endpoint}.ts",
  useDefaultRequester: true,
  // other overrides...
};
*/
