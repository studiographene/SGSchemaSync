import fs from "fs/promises";
// import fetch from "node-fetch"; // Remove node-fetch import
import axios from "axios"; // Import axios
import { PackageConfig, defaultPackageConfig } from "./config";

// Basic placeholder type - ideally, install and use a package like 'openapi-types'
export type OpenAPISpec = any;

// Axios request configuration
export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
}

// Default axios request configuration
export const defaultRequestConfig: RequestConfig = {
  timeout: 10000,
  headers: {
    "Accept": "application/json, text/plain",
  },
};

export interface ParserConfig {
  packageConfig?: Partial<PackageConfig>;
  requestConfig?: Partial<RequestConfig>;
}

export async function loadAndParseSpec(config: ParserConfig = {}): Promise<OpenAPISpec> {
  // Merge default package config with provided package config
  const mergedPackageConfig = {
    ...defaultPackageConfig,
    ...config.packageConfig,
  };

  // Validate baseURL is provided
  if (!mergedPackageConfig.baseURL) {
    throw new Error("baseURL is required in package configuration. Please provide it through environment variables or config.");
  }

  let specContent: string;
  const specUrl = `${mergedPackageConfig.baseURL}`;

  console.log(`Fetching spec from URL: ${specUrl}`);
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
    const response = await axios.get(specUrl, {
      ...mergedRequestConfig,
      responseType: "text",
    });
    specContent = response.data;
  } catch (error: any) {
    const message = error.response ? `${error.message} (status: ${error.response.status})` : error.message;
    throw new Error(`Failed to fetch spec from ${specUrl}: ${message}`);
  }

  try {
    const parsedSpec = JSON.parse(specContent);
    console.log("Successfully parsed OpenAPI specification.");
    
    // Add configuration flags to the parsed spec for later use
    return {
      ...parsedSpec,
      _config: mergedPackageConfig,
    };
  } catch (error: any) {
    throw new Error(`Failed to parse JSON specification: ${error.message}`);
  }
}
