import fs from "fs/promises";
// import fetch from "node-fetch"; // Remove node-fetch import
import axios from "axios"; // Import axios

// Basic placeholder type - ideally, install and use a package like 'openapi-types'
export type OpenAPISpec = any;

export async function loadAndParseSpec(inputPathOrUrl: string): Promise<OpenAPISpec> {
  let specContent: string;

  if (inputPathOrUrl.startsWith("http://") || inputPathOrUrl.startsWith("https://")) {
    console.log(`Fetching spec from URL using axios: ${inputPathOrUrl}`);
    try {
      // Use axios.get to fetch the spec
      const response = await axios.get(inputPathOrUrl, {
        responseType: "text", // Ensure we get plain text/json
        // Add any other necessary axios config here (e.g., headers)
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
    return parsedSpec;
  } catch (error: any) {
    throw new Error(`Failed to parse JSON specification: ${error.message}`);
  }
}
