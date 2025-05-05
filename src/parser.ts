import fs from "fs/promises";
// import fetch from "node-fetch"; // Remove node-fetch import
import axios from "axios"; // Import axios

// Basic placeholder type - ideally, install and use a package like 'openapi-types'
export type OpenAPISpec = any;

const axiosConfig = {
  baseURL: "https://dev.surveyapi.59club.studiographene.xyz/api-docs/",
  timeout: 10000,
  // Pattern for function names in PascalCase format
  // {method} and {endpoint} will be converted to PascalCase
  // Example: getUsers -> GetUsers.ts, postCreateUser -> PostCreateUser.ts
  generateFunctionNames: "{Method}{Endpoint}.ts",
  generateFunctions: true,
  headers: {
    "Accept": "application/json, text/plain",
  },
};

export interface ParserConfig {
  baseURL?: string;
  timeout?: number;
  generateFunctionNames?: string;
  generateFunctions?: boolean;
  headers?: Record<string, string>;
}

export async function loadAndParseSpec(
  inputPathOrUrl: string,
  config: ParserConfig = {}
): Promise<OpenAPISpec> {
  let specContent: string;

  if (inputPathOrUrl.startsWith("http://") || inputPathOrUrl.startsWith("https://")) {
    console.log(`Fetching spec from URL using axios: ${inputPathOrUrl}`);
    try {
      // Merge default config with provided config
      const mergedConfig = {
        ...axiosConfig,
        ...config,
        headers: {
          ...axiosConfig.headers,
          ...config.headers,
        },
      };

      // Use axios.get to fetch the spec with merged config
      const response = await axios.get(inputPathOrUrl, {
        ...mergedConfig,
        responseType: "text",
      });
      specContent = response.data; // Axios puts response body in data
    } catch (error: any) {
      // Improve error handling for axios
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
    
    // Add configuration flags to the parsed spec for later use
    return {
      ...parsedSpec,
      _config: {
        generateFunctionNames: config.generateFunctionNames ?? axiosConfig.generateFunctionNames,
        generateFunctions: config.generateFunctions ?? axiosConfig.generateFunctions,
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to parse JSON specification: ${error.message}`);
  }
}
