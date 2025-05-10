import fs from "fs/promises";
import fsSync from "fs"; // For existsSync
import path from "path";
import { execSync } from "child_process";
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
  console.log(
    `Generate React Query hooks (controlled by 'generateHooks' in config): ${options.reactQuery ? "Yes" : "No"}`
  );
  if (options.parserConfig.packageConfig?.useDefaultRequester) {
    console.log(`Default requester client file will be generated.`);
  }

  const baseOutputDir = path.resolve(process.cwd(), options.output);

  // To store details of generated tags for adapter scaffolding
  const generatedTagDetails: Array<{
    tagName: string;
    sanitizedTagName: string;
    functionFactoryNames: string[];
    hookFactoryNames: string[];
    hooksFileGenerated: boolean;
    relativeDirFromProjectRoot: string; // Relative path to the tag directory from project root
  }> = [];

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

      // Store details for scaffolding
      generatedTagDetails.push({
        tagName,
        sanitizedTagName,
        functionFactoryNames,
        hookFactoryNames,
        hooksFileGenerated,
        relativeDirFromProjectRoot: path.relative(process.cwd(), tagOutputDir), // Path to tag dir from project root
      });

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

    // --- Scaffold Custom Requester Adapter File (if configured and not exists) ---
    const {
      useDefaultRequester,
      scaffoldRequesterAdapter,
      customRequesterAdapterPath,
      generateHooks: hooksGloballyEnabled, // To know if hooks were generally on
    } = options.parserConfig.packageConfig || {};

    if (!useDefaultRequester && scaffoldRequesterAdapter && customRequesterAdapterPath) {
      const resolvedAdapterPath = path.resolve(process.cwd(), customRequesterAdapterPath);
      const adapterDir = path.dirname(resolvedAdapterPath);

      if (!fsSync.existsSync(resolvedAdapterPath)) {
        try {
          await fs.mkdir(adapterDir, { recursive: true }); // Ensure directory exists
          const scaffoldContent = generateCustomAdapterScaffoldContent(
            generatedTagDetails,
            resolvedAdapterPath, // Pass adapter path to calculate relative paths to tag outputs
            options.output, // Pass base output dir to help with relative path calculation
            hooksGloballyEnabled ?? false
          );
          await fs.writeFile(resolvedAdapterPath, scaffoldContent, "utf-8");
          console.log(`\n✅ Scaffold for custom requester adapter created at: ${resolvedAdapterPath}`);
          console.log(`   Please complete the TODO sections in this file to integrate your project's HTTP client.`);
        } catch (scaffoldError) {
          console.warn(
            `\n⚠️ WARNING: Failed to create scaffold for custom requester adapter at ${resolvedAdapterPath}.`
          );
          console.warn(scaffoldError);
        }
      } else {
        console.log(
          `\nℹ️ Custom requester adapter file already exists at ${resolvedAdapterPath}. No scaffold generated.`
        );
        console.log(
          `   If you've added new API tags or operations, you may need to manually update this file with new factory imports and instantiations.`
        );
      }
    }

    // Format generated files with Prettier if enabled
    const { formatWithPrettier, prettierConfigPath } = options.parserConfig.packageConfig || {};

    if (formatWithPrettier) {
      try {
        console.log(`Formatting generated files with Prettier in ${baseOutputDir}...`);
        let prettierCommand = `npx prettier --write "${baseOutputDir}/**/*.ts" "${baseOutputDir}/**/*.js" --log-level warn`;
        if (prettierConfigPath) {
          // Ensure the path is resolved correctly if it's relative
          const resolvedPrettierConfigPath = path.resolve(process.cwd(), prettierConfigPath);
          prettierCommand += ` --config "${resolvedPrettierConfigPath}"`;
          console.log(`  Using Prettier config: ${resolvedPrettierConfigPath}`);
        }
        execSync(prettierCommand, { stdio: "inherit" });
        console.log("Prettier formatting complete.");
      } catch (prettierError) {
        console.warn(
          "\n⚠️ WARNING: Prettier formatting failed. Your files are generated but may not be formatted correctly."
        );
        console.warn(prettierError); // Log the error for more details
      }
    } else {
      console.log("Prettier formatting skipped as per configuration.");
    }

    console.log(`Successfully generated API client files in ${baseOutputDir}`);
  } catch (error) {
    console.error("Error generating client code:", error);
    throw error;
  }
}

// Helper function to generate scaffold content for the custom adapter
function generateCustomAdapterScaffoldContent(
  tagDetails: Array<{
    tagName: string;
    sanitizedTagName: string;
    functionFactoryNames: string[];
    hookFactoryNames: string[];
    hooksFileGenerated: boolean;
    relativeDirFromProjectRoot: string; // Path to tag output dir, relative to project root
  }>,
  adapterFilePath: string, // Absolute path to the adapter file itself
  outputBaseDirFromConfig: string, // The 'output' config option (e.g., 'src/api/schema-sync')
  hooksGloballyEnabled: boolean
): string {
  const adapterFileDir = path.dirname(adapterFilePath);

  let importsSection = "// --- Import Factory Functions ---\n";
  importsSection += "// TODO: Review and uncomment the imports for the API tags you want to use.\n";
  importsSection +=
    "// Adjust paths if your adapter file is not in the expected location relative to the output directory.\n\n";

  let instantiationsSection = "\n// --- Instantiate and Export API Clients ---\n";
  instantiationsSection += "// TODO: Uncomment and complete the instantiations for the factories you've imported.\n";
  instantiationsSection += "// Create additional exports as needed for your project structure.\n\n";

  for (const detail of tagDetails) {
    const targetTagFunctionsPath = path
      .join(outputBaseDirFromConfig, detail.sanitizedTagName, "functions")
      .replace(/\\\\/g, "/");
    let relativePathToFunctions = path.relative(adapterFileDir, targetTagFunctionsPath).replace(/\\\\/g, "/");
    if (!relativePathToFunctions.startsWith(".")) {
      relativePathToFunctions = "./" + relativePathToFunctions;
    }

    const functionsImportAlias = `${detail.sanitizedTagName}FunctionFactories`;
    importsSection += `// import * as ${functionsImportAlias} from '${relativePathToFunctions}';\n`;

    instantiationsSection += `// --- ${detail.tagName} API Clients ---\n`;
    if (detail.functionFactoryNames.length > 0) {
      const exampleFactoryFuncName = detail.functionFactoryNames[0];
      const exampleFuncName = exampleFactoryFuncName.replace(/^create/, "").replace(/Function$/, "");
      instantiationsSection += `// export const ${exampleFuncName} = ${functionsImportAlias}.${exampleFactoryFuncName}(myCustomSGSyncRequester);\n`;
    } else {
      instantiationsSection += `// No function factories generated for ${detail.tagName}.\n`;
    }

    if (hooksGloballyEnabled && detail.hooksFileGenerated && detail.hookFactoryNames.length > 0) {
      const targetTagHooksPath = path
        .join(outputBaseDirFromConfig, detail.sanitizedTagName, "hooks")
        .replace(/\\\\/g, "/");
      let relativePathToHooks = path.relative(adapterFileDir, targetTagHooksPath).replace(/\\\\/g, "/");
      if (!relativePathToHooks.startsWith(".")) {
        relativePathToHooks = "./" + relativePathToHooks;
      }
      const hooksImportAlias = `${detail.sanitizedTagName}HookFactories`;
      importsSection += `// import * as ${hooksImportAlias} from '${relativePathToHooks}';\n`;

      const exampleHookFactoryName = detail.hookFactoryNames[0];
      const exampleHookName = exampleHookFactoryName.replace(/^create/, "").replace(/Hook$/, "");
      instantiationsSection += `// export const ${exampleHookName} = ${hooksImportAlias}.${exampleHookFactoryName}(myCustomSGSyncRequester);\n`;
    }
    instantiationsSection += `// // TODO: Add other exports from the ${detail.tagName} API as needed\n\n`;
  }

  // Ensure adapterFilePath is correctly escaped for use in the template literal string
  const escapedAdapterFilePath = adapterFilePath.replace(/\\\\/g, "/"); // Normalize to forward slashes for string embedding

  return `// THIS IS AN AUTO-GENERATED SCAFFOLD FILE.
// You must complete the TODOs to integrate it with your project.
// This file will NOT be overwritten if it already exists.

import {
  SGSyncRequester,
  SGSyncRequesterOptions,
  SGSyncResponse,
} from "sg-schema-sync"; // Assuming 'sg-schema-sync' is the installed package name

// TODO: 1. Import your project's actual HTTP request function and its types.
// Example:
// import YOUR_PROJECT_REQUEST_FUNCTION from "@/services/apiService"; // Path to your API service
// import type { YourRequestOptions, YourResponse } from "@/services/apiService"; // Types for your service

${importsSection}

// TODO: 2. Implement the adapter function.
// This function maps sg-schema-sync's request options to your project's HTTP client options
// and maps your project's response back to the format sg-schema-sync expects.
const myCustomSGSyncRequester: SGSyncRequester = async <T = any>(
  sgOptions: SGSyncRequesterOptions
): Promise<SGSyncResponse<T>> => {
  console.log("[myCustomSGSyncRequester] Called with options:", sgOptions);

  // --- Adapt sgOptions to your HTTP client's expected input ---
  // Example mapping (adjust vigorously to your project's needs):
  // const projectRequestOptions /* : YourRequestOptions */ = {
  //   method: sgOptions.method,
  //   url: sgOptions.url, // sg-schema-sync provides the relative path (e.g., "/users/{id}")
  //   data: sgOptions.data,
  //   params: sgOptions.params,
  //   headers: sgOptions.headers,
  //   // authRequire: sgOptions.authRequire, // Your client might handle auth differently
  //   // ... other necessary fields for your client
  // };

  // --- Make the call using your project's HTTP client ---
  // Example:
  // const projectResponse /* : YourResponse<T> */ = await YOUR_PROJECT_REQUEST_FUNCTION(projectRequestOptions);

  // --- Adapt your HTTP client's response to SGSyncResponse<T> ---
  // Example mapping:
  // return {
  //   data: projectResponse.data as T, // Or however your client structures the response body
  //   status: projectResponse.status,
  //   statusText: projectResponse.statusText,
  //   headers: projectResponse.headers,
  //   config: sgOptions, // Pass original sg-schema-sync options back
  // };

  // Placeholder implementation (REMOVE THIS AND IMPLEMENT ABOVE):
  console.error(
    \`TODO: Implement myCustomSGSyncRequester in ${escapedAdapterFilePath}\n\` +
    "It needs to call your project's actual HTTP client and map options/responses."
  );
  return Promise.reject(
    new Error("myCustomSGSyncRequester not implemented.")
  ) as Promise<SGSyncResponse<T>>;
};

${instantiationsSection}

// Example of a placeholder export if you have no APIs instantiated yet.
// Remove this once you have actual exports.
export const placeholderApi = {};

// TODO: 3. After implementing the requester and uncommenting/adding exports above,
//          ensure this file is imported and used appropriately in your application
//          to access the instantiated API clients.
`;
}
