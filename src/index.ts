import fs from "fs/promises";
import path from "path";
import { loadAndParseSpec, ParserConfig } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { defaultPackageConfig } from "./config";

export interface GeneratorOptions {
  parserConfig: ParserConfig;
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
  if (options.parserConfig.packageConfig?.useDefaultRequester) {
    console.log(`Default requester client file will be generated.`);
  }

  const baseOutputDir = path.resolve(process.cwd(), options.output);

  try {
    const initialSpec = await loadAndParseSpec(options.parserConfig);

    let specToUse: OpenAPIV3.Document;
    try {
      console.log("Attempting to dereference OpenAPI specification...");
      specToUse = (await $RefParser.dereference(initialSpec as any)) as OpenAPIV3.Document;
      console.log("Dereferencing successful.");
    } catch (dereferenceError: any) {
      console.warn(`\n⚠️ WARNING: Failed to dereference OpenAPI spec: ${dereferenceError.message}`);
      console.warn("  Proceeding with the original spec. Type generation for $ref schemas may fail.\n");
      specToUse = initialSpec as OpenAPIV3.Document;
    }

    if (!specToUse || !specToUse.paths) {
      throw new Error("Invalid OpenAPI specification: Missing paths object.");
    }

    const operationsByTag: Record<string, OperationInfo[]> = {};
    for (const pathKey in specToUse.paths) {
      const pathItem = specToUse.paths[pathKey] as OpenAPIV3.PathItemObject;
      if (!pathItem) continue;
      for (const method in pathItem) {
        if (Object.values(OpenAPIV3.HttpMethods).includes(method as OpenAPIV3.HttpMethods)) {
          const operation = pathItem[method as keyof OpenAPIV3.PathItemObject] as OpenAPIV3.OperationObject;
          if (operation && operation.tags && operation.tags.length > 0) {
            const tagName = operation.tags[0];
            if (!operationsByTag[tagName]) operationsByTag[tagName] = [];
            operationsByTag[tagName].push({ path: pathKey, method: method as OpenAPIV3.HttpMethods, operation });
          } else {
            console.warn(`Operation ${method.toUpperCase()} ${pathKey} has no tags, skipping.`);
          }
        }
      }
    }
    console.log(`Found operations grouped by tags: ${Object.keys(operationsByTag).join(", ")}`);

    for (const tagName in operationsByTag) {
      const sanitizedTagName = tagName.toLowerCase().replace(/\s+|\//g, "-");
      console.log(`Generating files for tag: ${tagName} (folder: ${sanitizedTagName})...`);
      const operations = operationsByTag[tagName];
      const tagOutputDir = path.join(baseOutputDir, sanitizedTagName);
      await fs.mkdir(tagOutputDir, { recursive: true });

      const { typesContent, functionsContent, hooksContent, functionFactoryNames, hookFactoryNames } =
        await generateFilesForTag(
          tagName,
          operations,
          specToUse,
          options.reactQuery ?? false,
          options.parserConfig.packageConfig || {}
        );

      const typesFilePath = path.join(tagOutputDir, "types.ts");
      const functionsFilePath = path.join(tagOutputDir, "functions.ts");
      await fs.writeFile(typesFilePath, typesContent, "utf-8");
      console.log(`  -> Types written to ${typesFilePath}`);
      await fs.writeFile(functionsFilePath, functionsContent, "utf-8");
      console.log(`  -> Function factories written to ${functionsFilePath}`);

      let hooksFileGenerated = false;
      if (options.reactQuery && hooksContent.trim()) {
        const hooksFilePath = path.join(tagOutputDir, "hooks.ts");
        await fs.writeFile(hooksFilePath, hooksContent, "utf-8");
        console.log(`  -> Hook factories written to ${hooksFilePath}`);
        hooksFileGenerated = true;
      }

      // Generate default client file if configured
      if (options.parserConfig.packageConfig?.useDefaultRequester) {
        const clientFileSuffix =
          options.parserConfig.packageConfig.defaultClientFileSuffix || defaultPackageConfig.defaultClientFileSuffix!;
        const clientFileName =
          `${sanitizedTagName}${clientFileSuffix.startsWith(".") ? clientFileSuffix : `.$${clientFileSuffix}`}`.replace(
            /\.\./g,
            "."
          ); // Avoid double dots if suffix starts with .
        const clientFilePath = path.join(tagOutputDir, clientFileName);

        const baseURLForDefault = options.parserConfig.packageConfig.baseURL || "";

        let clientFileContent = `// ${clientFileName} - Generated by SGSchema-Sync\n`;
        clientFileContent += `// This file provides a quick start client by using the default requester.\n`;
        clientFileContent += `// You can edit this file to customize its behavior or provide your own requester implementation.\n\n`;
        // Path to default-requester might need to be configurable or smarter based on actual package structure
        // For now, assuming 'sg-schema-sync' is the package name from which these are imported.\n`;
        clientFileContent += `import { createDefaultSGSyncRequester } from 'sg-schema-sync/default-requester'; // Adjust if package structure differs\n`;
        clientFileContent += `import type { SGSyncRequester } from 'sg-schema-sync/requester-types'; // Adjust if package structure differs\n\n`;

        clientFileContent += `import * as functionFactories from './functions';\n`;
        if (hooksFileGenerated && hookFactoryNames.length > 0) {
          clientFileContent += `import * as hookFactories from './hooks';\n`;
        }
        clientFileContent += `\n`;

        clientFileContent += `const baseURLFromConfig = '${baseURLForDefault.replace(/'/g, "\\'")}'; // Escape quotes in baseURL\n`;
        clientFileContent += `\n`;

        clientFileContent += `/**\n * Placeholder for your application's authentication token retrieval logic.\n * The default requester will call this function if an operation requires authentication.\n * @returns {string | null | Promise<string | null>} The bearer token or null.\n */\nconst getToken = async (): Promise<string | null> => {\n  // TODO: Implement your token retrieval logic here.\n  // Example: return localStorage.getItem('authToken');\n  console.warn('[SGSchema-Sync Client] getToken() needs to be implemented if authentication is required.');\n  return null;\n};`;
        clientFileContent += `\n`;

        clientFileContent += `const configuredRequester: SGSyncRequester = createDefaultSGSyncRequester({\n  baseURL: baseURLFromConfig,\n  getToken,\n});\n\n`;

        clientFileContent += `// --- Instantiated API Functions ---\n`;
        for (const factoryFuncName of functionFactoryNames) {
          // e.g. factoryFuncName = createGetUserByIdFunction
          // We want to export GetUserById
          const funcName = factoryFuncName.replace(/^create/, "").replace(/Function$/, "");
          clientFileContent += `export const ${funcName} = functionFactories.${factoryFuncName}(configuredRequester);\n`;
        }
        clientFileContent += `\n`;

        if (hooksFileGenerated && hookFactoryNames.length > 0) {
          clientFileContent += `// --- Instantiated React Query Hooks ---\n`;
          for (const hookFactoryFuncName of hookFactoryNames) {
            // e.g. hookFactoryFuncName = createUseGetUserByIdHook
            // We want to export useGetUserById
            const hookName = hookFactoryFuncName.replace(/^create/, "").replace(/Hook$/, "");
            clientFileContent += `export const ${hookName} = hookFactories.${hookFactoryFuncName}(configuredRequester);\n`;
          }
          clientFileContent += `\n`;
        }

        await fs.writeFile(clientFilePath, clientFileContent, "utf-8");
        console.log(`  -> Default client file written to ${clientFilePath}`);
      }

      // Generate and write the main index.ts for the tag
      let indexContent = `export * from './types';\n`;
      if (options.parserConfig.packageConfig?.useDefaultRequester) {
        const clientFileSuffix =
          options.parserConfig.packageConfig.defaultClientFileSuffix || defaultPackageConfig.defaultClientFileSuffix!;
        const clientFileNameWithoutExtension =
          `${sanitizedTagName}${clientFileSuffix.startsWith(".") ? clientFileSuffix : `.$${clientFileSuffix}`}`
            .replace(/\.\./g, ".")
            .replace(/\.ts$/, "");
        indexContent += `export * from './${clientFileNameWithoutExtension}'; // Exports from the default client file\n`;
      } else {
        // If not using default client, export factories for user to wire up
        indexContent += `export * from './functions'; // Exports function factories\n`;
        if (hooksFileGenerated) {
          indexContent += `export * from './hooks'; // Exports hook factories\n`;
        }
      }

      const indexFilePath = path.join(tagOutputDir, "index.ts");
      await fs.writeFile(indexFilePath, indexContent, "utf-8");
      console.log(`  -> Index file written to ${indexFilePath}`);
    }

    console.log(`Successfully generated API client files in ${baseOutputDir}`);
  } catch (error) {
    console.error("Error generating client code:", error);
    throw error;
  }
}
