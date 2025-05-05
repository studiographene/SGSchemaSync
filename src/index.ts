import fs from "fs/promises";
import path from "path";
import { loadAndParseSpec, OpenAPISpec } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";
import $RefParser from "@apidevtools/json-schema-ref-parser";

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
    // 1. Load and parse
    const initialSpec: OpenAPISpec | OpenAPIV3.Document = await loadAndParseSpec(options.input);

    // --- TEMPORARY DEBUG Check --- (can be removed later)
    if (!initialSpec?.components?.schemas?.Invitation) {
      console.warn("\n⚠️ DEBUG: Schema #/components/schemas/Invitation not found in the initial parsed spec.\n");
    } // ---

    let specToUse: OpenAPIV3.Document;
    // 1.5 Attempt to dereference the spec to resolve all $refs
    try {
      console.log("Attempting to dereference OpenAPI specification...");
      // Explicitly cast the dereferenced result to OpenAPIV3.Document
      specToUse = (await $RefParser.dereference(initialSpec as any)) as OpenAPIV3.Document;
      console.log("Dereferencing successful.");
    } catch (dereferenceError: any) {
      console.warn(`\n⚠️ WARNING: Failed to dereference OpenAPI spec: ${dereferenceError.message}`);
      console.warn("  Proceeding with the original spec. Type generation for $ref schemas may fail.\n");
      // Fallback to using the initial (potentially unresolved) spec
      specToUse = initialSpec as OpenAPIV3.Document;
    }

    // Ensure paths exist in the spec we are using
    if (!specToUse || !specToUse.paths) {
      throw new Error("Invalid OpenAPI specification: Missing paths object in the spec being used.");
    }

    // 2. Group operations by tag (using specToUse)
    const operationsByTag: Record<string, OperationInfo[]> = {};

    for (const pathKey in specToUse.paths) {
      const pathItem = specToUse.paths[pathKey] as OpenAPIV3.PathItemObject;
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
            // Ensure we push the operation object from the spec we decided to use
            operationsByTag[tagName].push({ path: pathKey, method: method as OpenAPIV3.HttpMethods, operation });
          } else {
            // Handle operations without tags if necessary (e.g., group under 'default')
            console.warn(`Operation ${method.toUpperCase()} ${pathKey} has no tags, skipping.`);
          }
        }
      }
    }

    console.log(`Found operations grouped by tags: ${Object.keys(operationsByTag).join(", ")}`);

    // 3. Iterate through tags and call generator (passing specToUse)
    for (const tagName in operationsByTag) {
      // Sanitize tag name for file path usage (lowercase, replace space/slash with dash)
      const sanitizedTagName = tagName.toLowerCase().replace(/\s+|\//g, "-");
      console.log(`Generating files for tag: ${tagName} (filename: ${sanitizedTagName})...`);
      const operations = operationsByTag[tagName];
      const { typesContent, functionsContent } = await generateFilesForTag(tagName, operations, specToUse);

      // 4. Write generated files using sanitized name
      const typesFilePath = path.join(typesOutputDir, `${sanitizedTagName}.ts`);
      const functionsFilePath = path.join(functionsOutputDir, `${sanitizedTagName}.ts`);

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
