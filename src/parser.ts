import fs from "fs/promises";
import fetch from "node-fetch";

// Basic placeholder type - ideally, install and use a package like 'openapi-types'
export type OpenAPISpec = any;

export async function loadAndParseSpec(inputPathOrUrl: string): Promise<OpenAPISpec> {
  let specContent: string;

  if (inputPathOrUrl.startsWith("http://") || inputPathOrUrl.startsWith("https://")) {
    console.log(`Fetching spec from URL: ${inputPathOrUrl}`);
    const response = await fetch(inputPathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec from ${inputPathOrUrl}: ${response.statusText}`);
    }
    specContent = await response.text();
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
