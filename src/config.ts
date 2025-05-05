// Package configuration for code generation
export interface PackageConfig {
  generateFunctionNames: string;
  generateFunctions: boolean;
  generateTypesNames: string;
  baseURL: string;
}

// Default package configuration
export const defaultPackageConfig: PackageConfig = {
  generateFunctionNames: "{Method}{Endpoint}.ts",
  generateFunctions: true,
  generateTypesNames: "{Method}{Endpoint}.types.ts",
  // Default to empty string - should be overridden by client configuration
  baseURL: "",
};

// Example of how to use this in a client project:
/*
// config.ts in client project
import { PackageConfig } from 'your-package-name';

export const clientConfig: Partial<PackageConfig> = {
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  generateFunctionNames: "custom{Method}{Endpoint}.ts",
  // other overrides...
};
*/ 