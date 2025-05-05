import fs from "fs/promises";
import path from "path";
import { loadAndParseSpec, OpenAPISpec } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";

export interface GeneratorOptions {
  input: string;
  output: string;
}

// Helper type for passing operation details to the generator
export interface OperationInfo {
  path: string;
  method: OpenAPIV3.HttpMethods;
  operation: OpenAPIV3.OperationObject;
}

export async function runGenerator(options: GeneratorOptions): Promise<void> {
  console.log(`Starting API client generation...`);
  console.log(`Input spec: ${options.input}`);
  console.log(`Base output directory: ${options.output}`);

  // Define base output directories
  const baseOutputDir = path.resolve(process.cwd(), options.output);
  const typesOutputDir = path.join(baseOutputDir, "types");
  const functionsOutputDir = path.join(baseOutputDir, "functions");

  // Ensure base directories exist
  await fs.mkdir(typesOutputDir, { recursive: true });
  await fs.mkdir(functionsOutputDir, { recursive: true });

  try {
    // 1. Fetch or read and parse the input specification
    const spec: OpenAPISpec | OpenAPIV3.Document = await loadAndParseSpec(options.input);

    if (!spec || !spec.paths) {
      throw new Error("Invalid OpenAPI specification: Missing paths object.");
    }

    // 2. Group operations by tag
    const operationsByTag: Record<string, OperationInfo[]> = {};

    for (const pathKey in spec.paths) {
      const pathItem = spec.paths[pathKey] as OpenAPIV3.PathItemObject;
      if (!pathItem) continue;

      for (const method in pathItem) {
        // Check if the method is a valid HTTP method
        if (Object.values(OpenAPIV3.HttpMethods).includes(method as OpenAPIV3.HttpMethods)) {
          const operation = pathItem[method as keyof OpenAPIV3.PathItemObject] as OpenAPIV3.OperationObject;
          if (operation && operation.tags && operation.tags.length > 0) {
            const tagName = operation.tags[0]; // Use the first tag for grouping
            if (!operationsByTag[tagName]) {
              operationsByTag[tagName] = [];
            }
            operationsByTag[tagName].push({ path: pathKey, method: method as OpenAPIV3.HttpMethods, operation });
          } else {
            // Handle operations without tags if necessary (e.g., group under 'default')
            console.warn(`Operation ${method.toUpperCase()} ${pathKey} has no tags, skipping.`);
          }
        }
      }
    }

    console.log(`Found operations grouped by tags: ${Object.keys(operationsByTag).join(", ")}`);

    // 3. Iterate through tags and call generator
    for (const tagName in operationsByTag) {
      console.log(`Generating files for tag: ${tagName}...`);
      const operations = operationsByTag[tagName];
      const { typesContent, functionsContent } = await generateFilesForTag(tagName, operations, spec);

      // 4. Write generated files
      const typesFilePath = path.join(typesOutputDir, `${tagName.toLowerCase()}.ts`);
      const functionsFilePath = path.join(functionsOutputDir, `${tagName.toLowerCase()}.ts`);

      await fs.writeFile(typesFilePath, typesContent, "utf-8");
      console.log(`  -> Types written to ${typesFilePath}`);
      await fs.writeFile(functionsFilePath, functionsContent, "utf-8");
      console.log(`  -> Functions written to ${functionsFilePath}`);
    }

    console.log(`Successfully generated API client files in ${baseOutputDir}`);
  } catch (error) {
    console.error("Error generating client code:", error);
    // Re-throw or handle appropriately for CLI exit code
    throw error;
  }
}
