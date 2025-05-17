import fs from "fs/promises";
import fsSync from "fs"; // For existsSync
import path from "path";
import { execSync } from "child_process";
import { loadAndParseSpec } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { ResolvedPackageConfig, defaultConfig as baseDefaultConfig } from "./config";
import { writeFileIfChanged } from "./helpers/fs-helpers";
import prettier from "prettier";

// Helper to format content using Prettier
async function formatContent(content: string, prettierConfigPath?: string, filePath?: string): Promise<string> {
  try {
    const options: prettier.Options = {
      parser: "typescript", // Assume TypeScript for all generated files
      ...(await prettier.resolveConfig(prettierConfigPath || process.cwd(), { editorconfig: true })),
    };
    if (prettierConfigPath) {
      options.config = prettierConfigPath;
    }
    if (filePath) {
      options.filepath = filePath;
    }
    return await prettier.format(content, options);
  } catch (error) {
    console.warn(`⚠️ Prettier formatting failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn(`   Falling back to unformatted content for comparison/writing.`);
    return content; // Return original content if formatting fails
  }
}

// This interface is for the direct settings for an HTTP request, used by loadAndParseSpec
interface RequestConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface GeneratorOptions {
  packageConfig: ResolvedPackageConfig;
  requestConfig: RequestConfig; // For loadAndParseSpec
}

// Helper type for passing operation details to the generator
export interface OperationInfo {
  path: string;
  method: OpenAPIV3.HttpMethods;
  operation: OpenAPIV3.OperationObject;
}

export async function runGenerator(options: GeneratorOptions): Promise<void> {
  const { packageConfig, requestConfig } = options;

  console.log(`Starting API client generation...`);
  if (packageConfig.verbose) {
    console.log(`Base output directory: ${packageConfig.outputDir}`);
    console.log(`Generate React Query hooks: ${packageConfig.generateHooks ? "Yes" : "No"}`);
    if (packageConfig.useDefaultRequester) {
      console.log(`Default requester client file logic will be applied.`);
    }
    console.log(`Verbose logging enabled.`);
  }

  const baseOutputDir = path.resolve(process.cwd(), packageConfig.outputDir);

  let actualAbsoluteCustomRequesterPath: string | undefined;
  if (!packageConfig.useDefaultRequester && packageConfig.customRequesterConfig?.filePath) {
    const configuredPath = packageConfig.customRequesterConfig.filePath;
    if (path.isAbsolute(configuredPath)) {
      actualAbsoluteCustomRequesterPath = configuredPath;
    } else {
      actualAbsoluteCustomRequesterPath = path.resolve(baseOutputDir, configuredPath);
    }
  }

  const generatedTagDetails: Array<{
    tagName: string;
    sanitizedTagName: string;
    functionFactoryNames: string[];
    hookFactoryNames: string[];
    hooksFileGenerated: boolean;
    relativeDirFromProjectRoot: string;
  }> = [];

  try {
    // Pass the packageConfig.input, then the full packageConfig, then the requestConfig for HTTP aspects
    const initialSpec = await loadAndParseSpec(packageConfig.input, packageConfig, requestConfig);

    let specToUse: OpenAPIV3.Document;
    try {
      if (packageConfig.verbose) console.log("Attempting to dereference OpenAPI specification...");
      specToUse = (await $RefParser.dereference(initialSpec as any)) as OpenAPIV3.Document;
      if (packageConfig.verbose) console.log("Dereferencing successful.");
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
    if (packageConfig.verbose)
      console.log(`Found operations grouped by tags: ${Object.keys(operationsByTag).join(", ")}`);

    for (const tagName in operationsByTag) {
      const sanitizedTagName = tagName.toLowerCase().replace(/\s+|\//g, "-");
      if (packageConfig.verbose) console.log(`Generating files for tag: ${tagName} (folder: ${sanitizedTagName})...`);
      const operations = operationsByTag[tagName];
      const tagOutputDir = path.join(baseOutputDir, sanitizedTagName);
      await fs.mkdir(tagOutputDir, { recursive: true });

      const {
        typesContent,
        functionsContent,
        hooksContent,
        functionFactoryNames,
        hookFactoryNames,
        hasGeneratedTypes,
      } = await generateFilesForTag(
        tagName,
        operations,
        specToUse,
        packageConfig.generateHooks, // Use resolved config
        packageConfig // Pass the whole resolved packageConfig
      );

      const typesFilePath = path.join(tagOutputDir, "types.ts");
      const functionsFilePath = path.join(tagOutputDir, "functions.ts");

      // --- Format content BEFORE writing/comparison ---
      let formattedTypesContent = typesContent;
      let formattedFunctionsContent = functionsContent;
      let formattedHooksContent = hooksContent;

      if (packageConfig.formatWithPrettier) {
        if (packageConfig.verbose) console.log(`  Formatting generated content for ${tagName}...`);
        // Pass file paths for potentially better config resolution
        formattedTypesContent = await formatContent(typesContent, packageConfig.prettierConfigPath, typesFilePath);
        formattedFunctionsContent = await formatContent(
          functionsContent,
          packageConfig.prettierConfigPath,
          functionsFilePath
        );
        if (packageConfig.generateHooks && hooksContent.trim()) {
          formattedHooksContent = await formatContent(
            hooksContent,
            packageConfig.prettierConfigPath,
            path.join(tagOutputDir, "hooks.ts")
          );
        }
      }

      // --- Write files using the helper with FORMATTED content ---
      await writeFileIfChanged(typesFilePath, formattedTypesContent, packageConfig.verbose);
      await writeFileIfChanged(functionsFilePath, formattedFunctionsContent, packageConfig.verbose);

      let hooksFileGenerated = false;
      if (packageConfig.generateHooks && hooksContent.trim()) {
        const hooksFilePath = path.join(tagOutputDir, "hooks.ts");
        // Use the formatted content here
        await writeFileIfChanged(hooksFilePath, formattedHooksContent, packageConfig.verbose);
        hooksFileGenerated = true;
      }
      if (packageConfig.verbose && packageConfig.generateHooks && !hooksContent.trim()) {
        console.log(`  [Info] Hooks were enabled but no hook content generated for tag: ${tagName}`);
      }

      generatedTagDetails.push({
        tagName,
        sanitizedTagName,
        functionFactoryNames,
        hookFactoryNames,
        hooksFileGenerated,
        relativeDirFromProjectRoot: path.relative(process.cwd(), tagOutputDir),
      });

      // --- Generate the new orchestrator client module (e.g., user/client.ts) ---
      // This file is always overwritten and uses the configured requester.
      const clientModuleFileName = `${packageConfig.generatedClientModuleBasename}.ts`;
      const clientModuleFilePath = path.join(tagOutputDir, clientModuleFileName);
      let clientModuleContent = `// ${clientModuleFileName} - Generated by sg-schema-sync. DO NOT EDIT.\n`;
      clientModuleContent += `// This file is automatically generated and orchestrates API functions/hooks using a configured requester.\n\n`;

      // --- MODIFIED SECTION: Conditionally import SGSyncRequester type ---
      if (packageConfig.useDefaultRequester) {
        clientModuleContent += `import type { SGSyncRequester } from 'sg-schema-sync/requester-types'; // Adjust if pkg structure differs\n`;
      }
      // --- END MODIFIED SECTION ---

      // Import function factories
      if (packageConfig.generateFunctions && functionFactoryNames.length > 0) {
        clientModuleContent += `import * as functionFactories from './functions';\n`;
      }
      // Import hook factories
      if (packageConfig.generateHooks && hooksFileGenerated && hookFactoryNames.length > 0) {
        clientModuleContent += `import * as hookFactories from './hooks';\n`;
      }
      clientModuleContent += `\n`;

      // Requester import and instantiation
      let requesterInstanceName = "configuredRequester";
      if (packageConfig.useDefaultRequester) {
        if (!packageConfig.defaultRequesterConfig?.getTokenModulePath) {
          // This should have been caught by CLI validation, but double-check.
          throw new Error("Logic error: getTokenModulePath is required for default requester but not found.");
        }
        const relativeToGetToken = path
          .relative(tagOutputDir, path.resolve(process.cwd(), packageConfig.defaultRequesterConfig.getTokenModulePath))
          .replace(/\\\\/g, "/"); // Normalize path for import

        clientModuleContent += `import { ${packageConfig.defaultRequesterConfig.getTokenExportName} as getToken } from '${relativeToGetToken.startsWith(".") ? relativeToGetToken : "./" + relativeToGetToken}';\n`;
        clientModuleContent += `import { createDefaultSGSyncRequester } from \'sg-schema-sync/default-requester\'; // Adjust path if needed\\n\\n`;
        clientModuleContent += `const ${requesterInstanceName}: SGSyncRequester = createDefaultSGSyncRequester({\\n`;
        clientModuleContent += `  baseURL: "${packageConfig.baseURL?.replace(/'/g, "\\'") ?? ""}",\\n`;
        clientModuleContent += `  timeout: ${packageConfig.timeout},\\n`;
        if (packageConfig.headers) {
          clientModuleContent += `  headers: ${JSON.stringify(packageConfig.headers)},\\n`;
        }
        clientModuleContent += `  getToken,\\n`;
        clientModuleContent += `});\\n\\n`;
      } else {
        // Custom requester
        if (!actualAbsoluteCustomRequesterPath) {
          // This check ensures that if we are using a custom requester, its path has been resolved.
          // packageConfig.customRequesterConfig.filePath and exportName are guaranteed by ResolvedPackageConfig if !useDefaultRequester
          throw new Error(
            "Logic error: actualAbsoluteCustomRequesterPath is not defined even though custom requester is selected."
          );
        }

        const relativeToCustomRequester = path
          .relative(tagOutputDir, actualAbsoluteCustomRequesterPath)
          .replace(/\\\\/g, "/")
          .replace(/\.(ts|js|mjs|cjs|jsx|tsx)$/, ""); // Strip common extensions

        requesterInstanceName = packageConfig.customRequesterConfig.exportName;
        clientModuleContent += `import { ${requesterInstanceName} } from '${relativeToCustomRequester.startsWith(".") ? relativeToCustomRequester : "./" + relativeToCustomRequester}';\n\n`;
        // User provides the already instantiated requester
      }

      // Instantiate and export functions
      if (packageConfig.generateFunctions && functionFactoryNames.length > 0) {
        clientModuleContent += `// --- Instantiated API Functions ---\n`;
        for (const factoryFuncName of functionFactoryNames) {
          const funcName = factoryFuncName.replace(/^create/, "").replace(/Function$/, "");
          clientModuleContent += `export const ${funcName} = functionFactories.${factoryFuncName}(${requesterInstanceName});\n`;
        }
        clientModuleContent += `\n`;
      }

      // Instantiate and export hooks
      if (packageConfig.generateHooks && hooksFileGenerated && hookFactoryNames.length > 0) {
        clientModuleContent += `// --- Instantiated React Query Hooks ---\n`;
        for (const hookFactoryFuncName of hookFactoryNames) {
          const hookName = hookFactoryFuncName.replace(/^create/, "").replace(/Hook$/, "");
          clientModuleContent += `export const ${hookName} = hookFactories.${hookFactoryFuncName}(${requesterInstanceName});\n`;
        }
        clientModuleContent += `\n`;
      }

      // --- Format client module content ---
      let formattedClientModuleContent = clientModuleContent;
      if (packageConfig.formatWithPrettier) {
        formattedClientModuleContent = await formatContent(
          clientModuleContent,
          packageConfig.prettierConfigPath,
          clientModuleFilePath
        );
      }

      // Use the new helper function with formatted content
      await writeFileIfChanged(clientModuleFilePath, formattedClientModuleContent, packageConfig.verbose);

      // Generate and write the main index.ts for the tag
      let indexContent = "";
      if (hasGeneratedTypes) {
        indexContent += `export * from './types';\n`;
      }
      indexContent += `export * from './${packageConfig.generatedClientModuleBasename}'; // Exports from the new client module\n`;
      // We no longer directly export factories if useDefaultRequester is false from here;
      // they are consumed by the generated client module which then exports the final instances.

      const indexFilePath = path.join(tagOutputDir, "index.ts");

      // --- Format index file content ---
      let formattedIndexContent = indexContent;
      if (packageConfig.formatWithPrettier) {
        formattedIndexContent = await formatContent(indexContent, packageConfig.prettierConfigPath, indexFilePath);
      }

      // Use the new helper function with formatted content
      await writeFileIfChanged(indexFilePath, formattedIndexContent, packageConfig.verbose);

      if (packageConfig.verbose) console.log(`Finished processing tag: ${tagName}`);
    }

    // --- Scaffold Custom Requester File (if configured and not using default) ---
    if (
      !packageConfig.useDefaultRequester &&
      packageConfig.customRequesterConfig &&
      actualAbsoluteCustomRequesterPath
    ) {
      // Use the pre-calculated actualAbsoluteCustomRequesterPath for scaffolding
      const customRequesterDir = path.dirname(actualAbsoluteCustomRequesterPath);

      const scaffoldEnabled = packageConfig.scaffoldRequesterAdapter;

      if (scaffoldEnabled && !fsSync.existsSync(actualAbsoluteCustomRequesterPath)) {
        try {
          await fs.mkdir(customRequesterDir, { recursive: true });
          const scaffoldContent = generateCustomRequesterScaffold(
            packageConfig.customRequesterConfig.exportName, // exportName is guaranteed
            packageConfig
          );
          await fs.writeFile(actualAbsoluteCustomRequesterPath, scaffoldContent, "utf-8");
          console.log(`\n✅ Scaffold for custom requester created at: ${actualAbsoluteCustomRequesterPath}`);
          console.log(`   Please complete the implementation in this file.`);
        } catch (scaffoldError: any) {
          console.warn(
            `\n⚠️ WARNING: Failed to create scaffold for custom requester at ${actualAbsoluteCustomRequesterPath}: ${scaffoldError.message}`
          );
        }
      } else if (fsSync.existsSync(actualAbsoluteCustomRequesterPath)) {
        console.log(
          `\nℹ️ Custom requester file already exists at ${actualAbsoluteCustomRequesterPath}. No scaffold generated.`
        );
      }
    }

    console.log(`Successfully generated API client files in ${baseOutputDir}`);
  } catch (error) {
    console.error("Error generating client code:", error);
    throw error;
  }
}

// New function to generate scaffold for the custom requester file
function generateCustomRequesterScaffold(exportName: string, packageConfig: ResolvedPackageConfig): string {
  const requesterFileName = packageConfig.customRequesterConfig.filePath.split("/").pop() || "schema-sync-requester.ts";
  let content = `// ${requesterFileName} - Generated by sg-schema-sync. Implement your custom requester here.\\n`;
  content += `// This file was generated because \\\`useDefaultRequester\\\` is false and the file did not exist.\\n`;
  content += `// You need to implement the ${exportName} object with a 'request' method to match the SGSyncRequester interface.\\n\\n`;
  content += `import type { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from 'sg-schema-sync/requester-types'; // Adjust path if necessary\\n\\n`;
  content += `// Example using Fetch API (browser or Node.js with node-fetch)\\n`;
  content += `/*\\nexport const ${exportName}: SGSyncRequester = {\\n`;
  content += `  request: async <TResponseData = any, TRequestBody = any, TQueryParams = any>(\\n`;
  content += `    options: SGSyncRequesterOptions<TRequestBody, TQueryParams>\\n`;
  content += `  ): Promise<SGSyncResponse<TResponseData>> => {\\n`;
  content += `    const { method, url, params, data, headers: reqHeaders, authRequire } = options; // Note: authRequired changed to authRequire\\n\\n`;
  content += `    // Construct URL with query parameters\\n`;
  content += `    let fullUrlString = url; // Assume baseURL is handled by the user or prepended if necessary\\n`;
  content += `    if (params) {\\n`;
  content += `      const query = new URLSearchParams();\\n`;
  content += `      Object.keys(params).forEach(key => {\\n`;
  content += `        const paramValue = (params as any)[key];\\n`;
  content += `        if (paramValue !== undefined) { // Important to check for undefined\\n`;
  content += `          if (Array.isArray(paramValue)) {\\n`;
  content += `            paramValue.forEach(v => query.append(key, String(v)));\\n`;
  content += `          } else {\\n`;
  content += `            query.append(key, String(paramValue));\\n`;
  content += `          }\\n`;
  content += `        }\\n`;
  content += `      });\\n`;
  content += `      const queryString = query.toString();\\n`;
  content += `      if (queryString) {\\n`;
  content += `        fullUrlString += \`?\${queryString}\`;\\n`;
  content += `      }\\n`;
  content += `    }\\n\\n`;
  content += `    // Handle authentication (example: Bearer token)\\n`;
  content += `    const effectiveHeaders = {\\n`;
  content += `      'Content-Type': 'application/json',\\n`;
  content += `      ...reqHeaders,\\n`;
  content += `    };\\n\\n`;
  content += `    if (authRequire) {\\n`;
  content += `      // const token = await myAuthService.getToken(); // Your token logic\\n`;
  content += `      // if (token) {\\n`;
  content += `      //   (effectiveHeaders as any)['Authorization'] = \\\`Bearer \\\${token}\\\`;\\n`;
  content += `      // } else {\\n`;
  content += `      //   console.warn(\\\`[${exportName}] Authentication required for \\\${method.toUpperCase()} \\\${url}, but no token was provided.\\\`);\\n`;
  content += `      // }\\n`;
  content += `      console.warn(\\\`[${exportName}.request] Authentication required for \\\${method.toUpperCase()} \\\${url}, but token logic is a placeholder.\\\`);\\n`;
  content += `    }\\n\\n`;
  content += `    try {\\n`;
  content += `      const response = await fetch(fullUrlString, {\\n`;
  content += `        method: method.toUpperCase(),\\n`;
  content += `        headers: effectiveHeaders,\\n`;
  content += `        body: data ? JSON.stringify(data) : undefined,\\n`;
  content += `      });\\n\\n`;
  content += `      let responseData: any;\\n`;
  content += `      const contentType = response.headers.get('content-type');\\n`;
  content += `      if (contentType && contentType.includes('application/json')) {\\n`;
  content += `        responseData = await response.json().catch(() => undefined); // Gracefully handle empty JSON response\\n`;
  content += `      } else {\\n`;
  content += `        responseData = await response.text(); // Or handle other content types\\n`;
  content += `      }\\n\\n`;
  content += `      const sgResponse: SGSyncResponse<TResponseData> = {\\n`;
  content += `        data: responseData as TResponseData,\\n`;
  content += `        status: response.status,\\n`;
  content += `        statusText: response.statusText,\\n`;
  content += `        headers: Object.fromEntries(response.headers.entries()),\\n`;
  content += `        config: options, // The original request options\\n`;
  content += `        originalResponse: response, // Optional: include the raw response\\n`;
  content += `      };\\n\\n`;
  content += `      if (!response.ok) {\\n`;
  content += `        // You might want to throw a custom error or an error object that includes sgResponse\\n`;
  content += `        // For example, you could augment an Error object with a 'response' property:\\n`;
  content += `        // const error: any = new Error(\\\`Request failed with status \\\${response.status}\\\`);\\n`;
  content += `        // error.response = sgResponse;\\n`;
  content += `        // throw error;\\n`;
  content += `        // For now, we'll mark it as an error and return the response structure\\n`;
  content += `        return { ...sgResponse, isError: true };\\n`;
  content += `      }\\n\\n`;
  content += `      return sgResponse;\\n`;
  content += `    } catch (error: any) {\\n`;
  content += `      console.error(\\\`[${exportName}.request] Request failed for \\\${method.toUpperCase()} \\\${url}:\\\`, error);\\n`;
  content += `      // Construct a response-like error object to maintain consistency\\n`;
  content += `      return {\\n`;
  content += `        data: null as TResponseData, // Or error.message or some error structure\\n`;
  content += `        status: 0, // Or a specific error code, e.g., from error.cause if available\\n`;
  content += `        statusText: error.message || 'Network error or processing issue',\\n`;
  content += `        headers: {},\\n`;
  content += `        config: options,\\n`;
  content += `        isError: true,\\n`;
  content += `        originalResponse: error, // The caught error itself\\n`;
  content += `      };\\n`;
  content += `    }\\n`;
  content += `  }\\n`;
  content += `};\\n*/\\n\\n`;
  content += `// TODO: Implement your custom requester logic here.\\n`;
  content += `// Below is a placeholder that will throw an error.\\n`;
  content += `export const ${exportName}: SGSyncRequester = {\\n`;
  content += `  request: async <TResponseData = any, TRequestBody = any, TQueryParams = any>(\\n`;
  content += `    options: SGSyncRequesterOptions<TRequestBody, TQueryParams>\\n`;
  content += `  ): Promise<SGSyncResponse<TResponseData>> => {\\n`;
  content += `    console.error(\`SGSyncRequester (${exportName}.request) has not been implemented. Please provide your HTTP client logic.\`, options);\\n`;
  content += `    throw new Error(\`SGSyncRequester (${exportName}.request) not implemented.\`);\\n`;
  content += `  }\\n`;
  content += `};\\n`;

  return content;
}
