import fs from "fs/promises";
// import fetch from "node-fetch"; // Remove node-fetch import
import axios from "axios"; // Import axios

// Basic placeholder type - ideally, install and use a package like 'openapi-types'
export type OpenAPISpec = any;

// Package configuration for code generation
export interface PackageConfig {
  generateFunctionNames: string;
  generateFunctions: boolean;
  generateTypesNames: string;
}

// Default package configuration
export const defaultPackageConfig: PackageConfig = {
  generateFunctionNames: "{Method}{Endpoint}.ts",
  generateFunctions: true,
  generateTypesNames: "{Method}{Endpoint}.types.ts",
};

// Axios request configuration
export interface RequestConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

// Default axios request configuration
export const defaultRequestConfig: RequestConfig = {
  baseURL: "https://dev.surveyapi.59club.studiographene.xyz/api-docs/",
  timeout: 10000,
  headers: {
    "Accept": "application/json, text/plain",
  },
};

export interface ParserConfig {
  packageConfig?: Partial<PackageConfig>;
  requestConfig?: Partial<RequestConfig>;
}

export async function loadAndParseSpec(
  inputPathOrUrl: string,
  config: ParserConfig = {}
): Promise<OpenAPISpec> {
  let specContent: string;

  if (inputPathOrUrl.startsWith("http://") || inputPathOrUrl.startsWith("https://")) {
    console.log(`Fetching spec from URL using axios: ${inputPathOrUrl}`);
    try {
      // Merge default request config with provided request config
      const mergedRequestConfig = {
        ...defaultRequestConfig,
        ...config.requestConfig,
        headers: {
          ...defaultRequestConfig.headers,
          ...config.requestConfig?.headers,
        },
      };

      // Use axios.get to fetch the spec with merged config
      const response = await axios.get(inputPathOrUrl, {
        ...mergedRequestConfig,
        responseType: "text",
      });
      specContent = response.data;
    } catch (error: any) {
      const message = error.response ? `${error.message} (status: ${error.response.status})` : error.message;
      throw new Error(`Failed to fetch spec from ${inputPathOrUrl}: ${message}`);
    }
  } else {
    console.log(`Reading spec from file: ${inputPathOrUrl}`);
    try {
      specContent = await fs.readFile(inputPathOrUrl, "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to read spec file ${inputPathOrUrl}: ${error.message}`);
    }
  }

  try {
    const parsedSpec = JSON.parse(specContent);
    console.log("Successfully parsed OpenAPI specification.");
    
    // Merge default package config with provided package config
    const mergedPackageConfig = {
      ...defaultPackageConfig,
      ...config.packageConfig,
    };

    // Add configuration flags to the parsed spec for later use
    return {
      ...parsedSpec,
      _config: mergedPackageConfig,
    };
  } catch (error: any) {
    throw new Error(`Failed to parse JSON specification: ${error.message}`);
  }
}
