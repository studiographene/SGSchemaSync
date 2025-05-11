import fs from "fs/promises";
import fsSync from "fs"; // For existsSync
import path from "path";
import { execSync } from "child_process";
import { loadAndParseSpec } from "./parser";
import { generateFilesForTag } from "./generator";
import { OpenAPIV3 } from "openapi-types";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { ResolvedPackageConfig, defaultConfig as baseDefaultConfig } from "./config";

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
  console.log(`Base output directory: ${packageConfig.outputDir}`);
  console.log(`Generate React Query hooks: ${packageConfig.generateHooks ? "Yes" : "No"}`);
  if (packageConfig.useDefaultRequester) {
    console.log(`Default requester client file logic will be applied.`);
    // The actual file generation logic using generatedClientModuleBasename is further down
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
          packageConfig.generateHooks, // Use resolved config
          packageConfig // Pass the whole resolved packageConfig
        );

      const typesFilePath = path.join(tagOutputDir, "types.ts");
      const functionsFilePath = path.join(tagOutputDir, "functions.ts");
      await fs.writeFile(typesFilePath, typesContent, "utf-8");
      console.log(`  -> Types written to ${typesFilePath}`);
      await fs.writeFile(functionsFilePath, functionsContent, "utf-8");
      console.log(`  -> Function factories written to ${functionsFilePath}`);

      let hooksFileGenerated = false;
      if (packageConfig.generateHooks && hooksContent.trim()) {
        const hooksFilePath = path.join(tagOutputDir, "hooks.ts");
        await fs.writeFile(hooksFilePath, hooksContent, "utf-8");
        console.log(`  -> Hook factories written to ${hooksFilePath}`);
        hooksFileGenerated = true;
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
      clientModuleContent += `import type { SGSyncRequester } from 'sg-schema-sync/requester-types'; // Adjust if pkg structure differs\n`;

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
          .replace(/\\\\/g, "/");

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
      await fs.writeFile(clientModuleFilePath, clientModuleContent, "utf-8");
      console.log(`  -> Client module written to ${clientModuleFilePath}`);

      // Generate and write the main index.ts for the tag
      let indexContent = `export * from './types';\n`;
      indexContent += `export * from './${packageConfig.generatedClientModuleBasename}'; // Exports from the new client module\n`;
      // We no longer directly export factories if useDefaultRequester is false from here;
      // they are consumed by the generated client module which then exports the final instances.

      const indexFilePath = path.join(tagOutputDir, "index.ts");
      await fs.writeFile(indexFilePath, indexContent, "utf-8");
      console.log(`  -> Index file written to ${indexFilePath}`);
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

    // Format generated files with Prettier if enabled
    const { formatWithPrettier, prettierConfigPath } = packageConfig || {};

    if (formatWithPrettier) {
      try {
        console.log(`Formatting generated files with Prettier in ${baseOutputDir}...`);
        // Only format .ts files as those are the only ones generated.
        let prettierCommand = `npx prettier --write "${baseOutputDir}/**/*.ts" --log-level warn`;
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

// New function to generate scaffold for the custom requester file
function generateCustomRequesterScaffold(exportName: string, packageConfig: ResolvedPackageConfig): string {
  const requesterFileName = packageConfig.customRequesterConfig.filePath.split("/").pop() || "schema-sync-requester.ts";
  let content = `// ${requesterFileName} - Generated by sg-schema-sync. Implement your custom requester here.\n`;
  content += `// This file was generated because \`useDefaultRequester\` is false and the file did not exist.\n`;
  content += `// You need to implement the ${exportName} function to match the SGSyncRequester interface.\n\n`;
  content += `import type { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from 'sg-schema-sync/requester-types'; // Adjust path if necessary\n\n`;
  content += `// Example using Fetch API (browser or Node.js with node-fetch)\n`;
  content += `/*\nexport const ${exportName}: SGSyncRequester = async <T = any>(\n  options: SGSyncRequesterOptions\n): Promise<SGSyncResponse<T>> => {\n  const { method, url, params, data, headers: reqHeaders, authRequired } = options;\n\n  // Construct URL with query parameters\n  const fullUrl = new URL(url);\n  if (params) {\n    Object.keys(params).forEach(key => {\n      if (params[key] !== undefined) { // Important to check for undefined\n        fullUrl.searchParams.append(key, String(params[key]));\n      }\n    });\n  }\n\n  // Handle authentication (example: Bearer token)\n  // You might get the token from a store, localStorage, etc.\n  if (authRequired) {\n    // const token = await myAuthService.getToken(); // Your token logic\n    // if (token) {\n    //   reqHeaders['Authorization'] = \\\`Bearer \\\${token}\\\`; // Literal \` and literal \${token}\n    // }\n    console.warn(\\\`[${exportName}] Authentication required for \\\${method.toUpperCase()} \\\${url}, but token logic is a placeholder.\\\`);\n  }\n\n  try {\n    const response = await fetch(fullUrl.toString(), {\n      method: method.toUpperCase(),\n      headers: {\n        'Content-Type': 'application/json',\n        ...reqHeaders,\n      },\n      body: data ? JSON.stringify(data) : undefined,\n    });\n\n    let responseData: any;\n    const contentType = response.headers.get('content-type');\n    if (contentType && contentType.includes('application/json')) {\n      responseData = await response.json();\n    } else {\n      responseData = await response.text(); // Or handle other content types\n    }\n\n    if (!response.ok) {\n      // Create an error object that mimics AxiosError for consistency if desired\n      const error: any = new Error(\\\`Request failed with status code \\\${response.status}\\\`);\n      error.isAxiosError = false; // Or a custom flag\n      error.response = {\n        data: responseData,\n        status: response.status,\n        statusText: response.statusText,\n        headers: Object.fromEntries(response.headers.entries()),\n        config: options, // The original request options\n      };\n      throw error;\n    }\n\n    return {\n      data: responseData as T,\n      status: response.status,\n      statusText: response.statusText,\n      headers: Object.fromEntries(response.headers.entries()),\n      config: options, // The original request options\n    };\n  } catch (error: any) {\n    console.error(\\\`[${exportName}] Request failed for \\\${method.toUpperCase()} \\\${url}:\\\`, error);\n    // Ensure the error re-thrown (or a new one) matches SGSyncError structure if you have one,\n    // or is compatible with how React Query handles errors.\n    // For simplicity, re-throwing the caught error or a new standard error.\n    if (error.response) { // If it looks like our structured error\n        throw error;\n    }\n    throw new Error(\\\`Network error or processing issue in ${exportName}: \\\${error.message}\\\`);\n  }\n};\n*/\n\n`;
  content += `// TODO: Implement your custom requester logic here.\n`;
  content += `// Below is a placeholder that will throw an error.\n`;
  content += `export const ${exportName}: SGSyncRequester = async <T = any>(\n`;
  content += `  options: SGSyncRequesterOptions\n`;
  content += `): Promise<SGSyncResponse<T>> => {\n`;
  content += `  console.error("SGSyncRequester (${exportName}) has not been implemented. Please provide your HTTP client logic.", options);\n`;
  content += `  throw new Error("SGSyncRequester (${exportName}) not implemented.");\n`;
  content += `};\n`;

  return content;
}
