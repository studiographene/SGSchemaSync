import axios from "axios"; // Import axios
import fs from "fs/promises";
import path from "path";
import { ResolvedPackageConfig } from "./config";
import { OpenAPIV3 } from "openapi-types"; // Import the specific type

// Define the specific type for the OpenAPI spec object
export type OpenAPISpec = OpenAPIV3.Document & { _config?: ResolvedPackageConfig };

// HTTP request configuration, similar to one in index.ts but can be standalone here
export interface HttpRequestConfig {
  baseURL?: string; // To resolve relative input URLs
  timeout?: number;
  headers?: Record<string, string>;
}

// Default HTTP request configuration for fetching spec if it's a URL
export const defaultHttpRequestConfig: HttpRequestConfig = {
  timeout: 10000,
  headers: {
    Accept: "application/json, text/plain, application/yaml, text/yaml",
  },
};

export interface ParserConfig {
  packageConfig?: Partial<ResolvedPackageConfig>;
  requestConfig?: Partial<HttpRequestConfig>;
}

export async function loadAndParseSpec(
  specInput: string | Record<string, any>, // Path, URL, or spec object
  pkgConfig: ResolvedPackageConfig, // Pass the full resolved package config
  httpConfig: HttpRequestConfig = {}
): Promise<OpenAPISpec> {
  let specContent: string;

  if (typeof specInput === "string") {
    if (specInput.startsWith("http://") || specInput.startsWith("https://")) {
      // Input is a URL
      console.log(`Fetching spec from URL: ${specInput}`);
      const mergedHttpConfig = {
        ...defaultHttpRequestConfig,
        ...httpConfig,
        headers: {
          ...defaultHttpRequestConfig.headers,
          ...httpConfig.headers,
        },
        // Use baseURL from httpConfig or pkgConfig if specInput is relative, otherwise specInput is absolute
        baseURL: httpConfig.baseURL || pkgConfig.baseURL,
      };
      try {
        const response = await axios.get(specInput, {
          ...mergedHttpConfig,
          timeout: mergedHttpConfig.timeout || defaultHttpRequestConfig.timeout,
          responseType: "text",
        });
        specContent = response.data;
      } catch (error: any) {
        const message = error.response ? `${error.message} (status: ${error.response.status})` : error.message;
        throw new Error(`Failed to fetch spec from ${specInput}: ${message}`);
      }
    } else {
      // Input is a file path
      const filePath = path.resolve(process.cwd(), specInput);
      console.log(`Reading spec from file: ${filePath}`);
      try {
        specContent = await fs.readFile(filePath, "utf-8");
      } catch (error: any) {
        throw new Error(`Failed to read spec from file ${filePath}: ${error.message}`);
      }
    }
  } else if (typeof specInput === "object" && specInput !== null) {
    // Input is an object
    console.log("Using provided OpenAPI spec object.");
    specContent = JSON.stringify(specInput);
  } else {
    throw new Error("Invalid OpenAPI spec input: Must be a URL, file path, or a spec object.");
  }

  try {
    // Basic parsing (JSON or YAML)
    // More robust YAML parsing could be added here if needed (e.g. using js-yaml)
    let parsedSpec;
    if (specContent.trim().startsWith("{")) {
      // Simple check for JSON
      parsedSpec = JSON.parse(specContent);
    } else {
      // Assume YAML or handle error
      try {
        const yaml = await import("js-yaml");
        parsedSpec = yaml.load(specContent);
      } catch (e) {
        console.error("Failed to parse spec as YAML, ensure 'js-yaml' is installed if using YAML spec.", e);
        throw new Error("Failed to parse specification. Content is not valid JSON and YAML parsing failed.");
      }
    }

    console.log("Successfully parsed OpenAPI specification.");

    return {
      ...(parsedSpec as OpenAPIV3.Document), // Cast needed after parsing
      _config: pkgConfig, // Embed the resolved packageConfig for later use
    };
  } catch (error: any) {
    throw new Error(`Failed to parse JSON/YAML specification: ${error.message}`);
  }
}
