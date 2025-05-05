import fs from "fs/promises";
import path from "path";
import { loadAndParseSpec, OpenAPISpec } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { PackageConfig } from "./config";

export interface GeneratorOptions {
  packageConfig: Partial<PackageConfig>;
  output: string;
  reactQuery?: boolean;
}

// Helper type for passing operation details to the generator
export interface OperationInfo {
  path: string;
  method: OpenAPIV3.HttpMethods;
  operation: OpenAPIV3.OperationObject;
}

export async function runGenerator(options: GeneratorOptions): Promise<void> {
  console.log(`Starting API client generation...`);
  console.log(`Base output directory: ${options.output}`);
  console.log(`Generate React Query hooks: ${options.reactQuery ? "Yes" : "No"}`);

  const baseOutputDir = path.resolve(process.cwd(), options.output);

  try {
    // 1. Load and parse
    const initialSpec: OpenAPISpec | OpenAPIV3.Document = await loadAndParseSpec({
      packageConfig: options.packageConfig
    });

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

    // Iterate through tags, generate content, and write files to tag-specific folders
    for (const tagName in operationsByTag) {
      const sanitizedTagName = tagName.toLowerCase().replace(/\s+|\//g, "-");
      console.log(`Generating files for tag: ${tagName} (folder: ${sanitizedTagName})...`);
      const operations = operationsByTag[tagName];

      // --- Create the output directory for this specific tag ---
      const tagOutputDir = path.join(baseOutputDir, sanitizedTagName);
      await fs.mkdir(tagOutputDir, { recursive: true });

      // Generate content (function signature remains the same)
      const { typesContent, functionsContent, hooksContent } = await generateFilesForTag(
        tagName,
        operations,
        specToUse,
        options.reactQuery ?? false
      );

      // --- Define file paths within the tag directory ---
      const typesFilePath = path.join(tagOutputDir, "types.ts");
      const functionsFilePath = path.join(tagOutputDir, "functions.ts");
      const hooksFilePath = path.join(tagOutputDir, "hooks.ts");
      const indexFilePath = path.join(tagOutputDir, "index.ts");

      // --- Write the files ---
      await fs.writeFile(typesFilePath, typesContent, "utf-8");
      console.log(`  -> Types written to ${typesFilePath}`);

      await fs.writeFile(functionsFilePath, functionsContent, "utf-8");
      console.log(`  -> Functions written to ${functionsFilePath}`);

      let hooksFileGenerated = false;
      if (options.reactQuery && hooksContent.trim()) {
        await fs.writeFile(hooksFilePath, hooksContent, "utf-8");
        console.log(`  -> Query Hooks written to ${hooksFilePath}`);
        hooksFileGenerated = true;
      }

      // --- Generate and write the index.ts file ---
      let indexContent = `export * from './types';\nexport * from './functions';\n`;
      if (hooksFileGenerated) {
        // Only export hooks if the file was actually generated
        indexContent += `export * from './hooks';\n`;
      }
      await fs.writeFile(indexFilePath, indexContent, "utf-8");
      console.log(`  -> Index file written to ${indexFilePath}`);
    }

    console.log(`Successfully generated API client files in ${baseOutputDir}`);
  } catch (error) {
    console.error("Error generating client code:", error);
    // Re-throw or handle appropriately for CLI exit code
    throw error;
  }
}
