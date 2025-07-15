import { OpenAPIV3 } from "openapi-types";
import { compile, JSONSchema } from "json-schema-to-typescript"; // Added for _generateOperationTypes
import { OperationInfo } from "../index"; // Adjust path as necessary
import { ResolvedPackageConfig } from "../config"; // Adjust path as necessary
import { toTsIdentifier, toPascalCase } from "./generator-helpers"; // Assuming it's in the same dir or adjust

export interface OperationTypeNames {
  requestBodyTypeName: string | null;
  parametersTypeName: string | null;
  primaryResponseTypeName: string | null;
}

export interface OperationTypeGenerationFlags {
  requestBodyFailed: boolean;
  parametersTypeFailed: boolean;
  responseTypeFailed: boolean;
  primaryResponseTypeGenerated: boolean;
}

export interface GeneratedOperationTypes extends OperationTypeNames, OperationTypeGenerationFlags {
  typesString: string; // The concatenated string of generated TS types for this operation
}

// Helper function to generate types for a single operation
export async function _generateOperationTypes(
  opInfo: OperationInfo,
  typeBaseName: string, // e.g., CreateUser (from operationId or path)
  tagName: string, // For logging/warnings
  generatedTypeNames: Set<string>, // To track already generated type names globally for the tag
  spec: OpenAPIV3.Document,
  packageConfig: ResolvedPackageConfig
): Promise<GeneratedOperationTypes> {
  const { operation, method } = opInfo;
  let typesString = "";

  let actualRequestBodyTypeName: string | null = null;
  let requestBodyFailed = false;
  let actualParametersTypeName: string | null = null;
  let parametersTypeFailed = false;
  let primaryResponseTypeName: string | null = null;
  let primaryResponseTypeGenerated = false;
  let responseTypeFailed = false;

  const opPrefix = packageConfig.operationTypePrefix ? `${toPascalCase(packageConfig.operationTypePrefix)}_` : "";
  const schemaPrefix = packageConfig.schemaTypePrefix || "SSGEN_";

  // --- Generate Request Body Type ---
  if (operation.requestBody && "content" in operation.requestBody) {
    const requestBodySchema = operation.requestBody.content?.["application/json"]?.schema;
    if (requestBodySchema) {
      const typeName = `${opPrefix}${typeBaseName}_Request`;
      actualRequestBodyTypeName = typeName;
      if (!generatedTypeNames.has(typeName)) {
        try {
          let tsType = await compile({ ...(requestBodySchema as JSONSchema), components: spec.components }, typeName, {
            bannerComment: "",
          });
          tsType = filterAndPrefixDeclarations(tsType, generatedTypeNames, schemaPrefix);
          typesString += `\n${tsType}\n`;
          generatedTypeNames.add(typeName);
        } catch (err: any) {
          const errMsg = err.message;
          console.warn(`    [${tagName}] Failed to generate request body type ${typeName}: ${errMsg}`);
          typesString += `\n// ⚠️ Type generation failed for ${typeName}: ${errMsg}\n// Check the OpenAPI spec, especially $refs.\n`;
          actualRequestBodyTypeName = null;
          requestBodyFailed = true;
        }
      }
    }
  }

  // --- Generate Response Types ---
  for (const statusCode in operation.responses) {
    if (statusCode.startsWith("2")) {
      // Consider all 2xx success responses
      const response = operation.responses[statusCode] as OpenAPIV3.ResponseObject;
      const primarySuccessCode = method === "post" ? "201" : "200"; // Common primary success codes
      const isPrimary = statusCode === primarySuccessCode;

      if (response && "content" in response && response.content?.["application/json"]?.schema) {
        const responseSchema = response.content["application/json"].schema;
        const typeName = `${opPrefix}${typeBaseName}_Response${isPrimary ? "" : `_${statusCode}`}`;
        if (isPrimary) primaryResponseTypeName = typeName;

        if (!generatedTypeNames.has(typeName)) {
          try {
            let tsType = await compile({ ...(responseSchema as JSONSchema), components: spec.components }, typeName, {
              bannerComment: "",
            });
            tsType = filterAndPrefixDeclarations(tsType, generatedTypeNames, schemaPrefix);
            typesString += `\n${tsType}\n`;
            generatedTypeNames.add(typeName);
            if (isPrimary) primaryResponseTypeGenerated = true;
          } catch (err: any) {
            const errMsg = err.message;
            console.warn(
              `    [${tagName}] Failed to generate response type ${typeName} (status ${statusCode}): ${errMsg}`
            );
            typesString += `\n// ⚠️ Type generation failed for ${typeName} (status ${statusCode}): ${errMsg}\n// Check the OpenAPI spec, especially $refs.\n`;
            if (isPrimary) responseTypeFailed = true;
          }
        } else {
          if (isPrimary) primaryResponseTypeGenerated = true; // Already generated, but it's our primary
        }
      } else if (isPrimary && !response?.content) {
        // If it's the primary success response and has no content (e.g., 204 No Content)
        primaryResponseTypeName = "void";
        primaryResponseTypeGenerated = true;
      } else if (isPrimary) {
        // Primary success response defined but has no schema or content for application/json
        console.warn(
          `    [${tagName}] No application/json content schema for primary success response ${primarySuccessCode} for operation ${opInfo.method.toUpperCase()} ${opInfo.path}.`
        );
        responseTypeFailed = true; // Mark as failed if primary schema is missing
      }
    }
  }

  // --- Generate Parameters Type (Query Params) ---
  const queryParams =
    (operation.parameters?.filter(
      (p) => (p as OpenAPIV3.ParameterObject).in === "query"
    ) as OpenAPIV3.ParameterObject[]) || [];
  if (queryParams.length > 0) {
    const paramsSchema: JSONSchema = { type: "object", properties: {}, required: [] };
    queryParams.forEach((p) => {
      if (paramsSchema.properties) {
        paramsSchema.properties[p.name] = p.schema || { type: "string" }; // Default to string if schema is missing
        if (p.required) {
          if (!Array.isArray(paramsSchema.required)) paramsSchema.required = [];
          paramsSchema.required.push(p.name);
        }
      }
    });
    if (Object.keys(paramsSchema.properties || {}).length > 0) {
      const typeName = `${opPrefix}${typeBaseName}_Parameters`;
      actualParametersTypeName = typeName;
      if (!generatedTypeNames.has(typeName)) {
        try {
          let tsType = await compile({ ...paramsSchema, components: spec.components }, typeName, {
            bannerComment: "",
            additionalProperties: false,
          });
          tsType = filterAndPrefixDeclarations(tsType, generatedTypeNames, schemaPrefix);
          typesString += `\n${tsType}\n`;
          generatedTypeNames.add(typeName);
        } catch (err: any) {
          const errMsg = err.message;
          console.warn(`    [${tagName}] Failed to generate parameters type ${typeName}: ${errMsg}`);
          typesString += `\n// ⚠️ Type generation failed for ${typeName}: ${errMsg}\n// Check the OpenAPI spec, especially $refs.\n`;
          actualParametersTypeName = null;
          parametersTypeFailed = true;
        }
      }
    }
  }
  // Note: Path parameters are handled directly in function/hook signatures, not as a separate type here.

  return {
    typesString,
    requestBodyTypeName: actualRequestBodyTypeName,
    parametersTypeName: actualParametersTypeName,
    primaryResponseTypeName: primaryResponseTypeName,
    requestBodyFailed,
    parametersTypeFailed,
    responseTypeFailed,
    primaryResponseTypeGenerated,
  };
}

// Helper function to generate a single generic function factory
export function _generateFunctionFactory(
  opInfo: OperationInfo, // Contains operation, path, method
  functionFactoryName: string, // e.g., createGetUserById
  summary: string, // Operation summary
  operationGroupBanner: string, // Formatted banner for the operation
  tagImportName: string, // e.g., UsersTypes
  processedPath: string, // Path after any stripping
  authRequire: boolean,
  actualRequestBodyTypeName: string | null,
  actualParametersTypeName: string | null, // For query params
  primaryResponseTypeName: string | null,
  // Flags indicating success/failure of type generation
  requestBodyFailed: boolean,
  parametersTypeFailed: boolean,
  responseTypeFailed: boolean,
  primaryResponseTypeGenerated: boolean,
  packageConfig: ResolvedPackageConfig // For potential future use or verbose logging inside
): string {
  const { operation, method } = opInfo;

  // Path parameters from the operation
  const pathParams =
    (operation.parameters?.filter(
      (p) => (p as OpenAPIV3.ParameterObject).in === "path"
    ) as OpenAPIV3.ParameterObject[]) || [];

  // Default Type Names for Generics
  const hasRequestBody = !!operation.requestBody;
  let defaultResponseType: string;
  if (primaryResponseTypeName === "void") {
    defaultResponseType = "void";
  } else if (primaryResponseTypeName && primaryResponseTypeGenerated) {
    defaultResponseType = `${tagImportName}.${primaryResponseTypeName}`;
  } else {
    defaultResponseType = "any";
  }

  const defaultRequestBodyType = actualRequestBodyTypeName
    ? `${tagImportName}.${actualRequestBodyTypeName}`
    : hasRequestBody
      ? "any"
      : "never";
  const defaultQueryParamsType = actualParametersTypeName ? `${tagImportName}.${actualParametersTypeName}` : "never";

  let needsTypesImport = false;
  if (
    (primaryResponseTypeName && primaryResponseTypeName !== "void") ||
    actualRequestBodyTypeName ||
    actualParametersTypeName
  ) {
    needsTypesImport = true;
  }
  const typesImportStatement = needsTypesImport ? `import * as ${tagImportName} from './types';\n` : "";

  // Path parameters signature part (e.g., "id: string, categoryId: string")
  const pathParamsForInnerFuncSignature = pathParams.map((p) => `${toTsIdentifier(p.name)}: string`);

  const innerFuncParamsList: string[] = [...pathParamsForInnerFuncSignature];

  if (hasRequestBody) {
    innerFuncParamsList.push(`data: TRequestBody`);
  }
  if (actualParametersTypeName) {
    // If TQueryParams defaults to 'never', it means no query params.
    // If the user provides a type, it will be used.
    // If they don't provide a type and there are query params, they'll get a type error if 'params' is not 'never'.
    innerFuncParamsList.push(`params: TQueryParams`);
  }

  // Constructing callSpecificOptionsType carefully to avoid including 'data' or 'params' if not applicable
  let callSpecificOptionsOmitParts = "'method' | 'url' | 'authRequire'";
  if (hasRequestBody) {
    callSpecificOptionsOmitParts += " | 'data'";
  }
  if (actualParametersTypeName) {
    callSpecificOptionsOmitParts += " | 'params'";
  }
  const callSpecificOptionsType = `Partial<Omit<SGSyncRequesterOptions<TRequestBody, TQueryParams>, ${callSpecificOptionsOmitParts}>>`;

  innerFuncParamsList.push(`callSpecificOptions?: ${callSpecificOptionsType}`);
  innerFuncParamsList.push(`customFlags?: Record<string, any>`);

  const innerFuncParamsString =
    innerFuncParamsList.length > 0 ? `\n    ${innerFuncParamsList.join(",\n    ")}\n  ` : "";

  const urlPath = processedPath.replace(/{([^}]+)}/g, (_match, paramNameInPath) => {
    const sanitizedParamName = toTsIdentifier(paramNameInPath);
    return `\${${sanitizedParamName}}`; // Corrected template literal placeholder
  });

  const warnings: string[] = [];
  if (requestBodyFailed) {
    warnings.push(
      `// ⚠️ WARNING: Request Body type generation failed for this operation. 'TRequestBody' default may be incorrect.`
    );
  }
  if (parametersTypeFailed) {
    warnings.push(
      `// ⚠️ WARNING: Parameters type generation failed for this operation. 'TQueryParams' default may be incorrect.`
    );
  }
  if (responseTypeFailed || (!primaryResponseTypeGenerated && primaryResponseTypeName !== "void")) {
    warnings.push(
      `// ⚠️ WARNING: Response type generation failed or schema missing for this operation. 'TResponse' default may be incorrect.`
    );
  }
  const warningBlock = warnings.length > 0 ? `${warnings.join("\n")}\n` : "";

  // Indent JSDoc summary lines correctly
  const indentedSummary = summary
    .split("\n")
    .map((line) => `   * ${line}`)
    .join("\n");

  return `${warningBlock}${operationGroupBanner}
export function ${functionFactoryName}(requester: SGSyncRequester) {
  /**
${indentedSummary}
   */
  return async <
    TResponse = ${defaultResponseType},
    TRequestBody = ${defaultRequestBodyType},
    TQueryParams = ${defaultQueryParamsType}
  >(${innerFuncParamsString}): Promise<TResponse> => {
    const response = await requester.request<TResponse, TRequestBody>({
      method: '${method.toUpperCase()}',
      url: \`${urlPath}\`,
      authRequire: ${authRequire},${
        hasRequestBody
          ? `
      data,`
          : ""
      }${
        actualParametersTypeName
          ? `
      params,`
          : ""
      }
      context: customFlags,
      ...(callSpecificOptions || {}),
    });
${defaultResponseType === "void" ? "    return undefined as TResponse; // Explicitly return undefined cast to TResponse" : "    return response.data;"}
  };
}
`;
}

// Helper function to generate a single generic hook factory
export function _generateHookFactory(
  opInfo: OperationInfo, // Contains operation, path, method
  hookFactoryName: string, // e.g., createUseGetUserByIdHook
  correspondingFunctionFactoryName: string, // e.g., createGetUserByIdFunction
  summary: string, // Operation summary
  operationGroupBanner: string, // Formatted banner for the operation
  tagImportName: string, // e.g., UsersTypes. Used for default generic types
  sanitizedTagName: string, // For query keys
  endpointBaseName: string, // For query keys
  processedPath: string, // For comments or potentially complex key generation
  // Type names for defaults (derived from _generateOperationTypes)
  actualRequestBodyTypeName: string | null,
  actualParametersTypeName: string | null,
  primaryResponseTypeName: string | null,
  primaryResponseTypeGenerated: boolean,
  // Path parameters of the operation
  pathParams: OpenAPIV3.ParameterObject[],
  packageConfig: ResolvedPackageConfig // For verbose logging or future options
): string {
  const { method } = opInfo;
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase());

  let queryKeyTypeAliasDefinition = ""; // Initialize here

  // Determine if the operation actually has a request body (even if type generation failed)
  const hasRequestBody = !!opInfo.operation.requestBody;

  // Default Type Names for Generics
  let defaultResponseType: string;
  if (primaryResponseTypeName === "void") {
    defaultResponseType = "void";
  } else if (primaryResponseTypeName && primaryResponseTypeGenerated) {
    defaultResponseType = `${tagImportName}.${primaryResponseTypeName}`;
  } else {
    defaultResponseType = "any";
  }

  const defaultRequestBodyType = actualRequestBodyTypeName
    ? `${tagImportName}.${actualRequestBodyTypeName}`
    : hasRequestBody
      ? "any"
      : "never";
  const defaultQueryParamsType = actualParametersTypeName ? `${tagImportName}.${actualParametersTypeName}` : "never";

  // React Query specific types
  const defaultQueryTData = defaultResponseType;
  const defaultMutationTData = defaultResponseType;
  // For mutations, TVariables often includes path params + request body + query params
  // For simplicity here, we'll make TVariables primarily about the request body or a combined object if needed.
  // The actual function called by the mutation will handle separating these.

  let defaultMutationTVariables = "void";
  if (hasRequestBody && actualParametersTypeName) {
    // Need a way to combine these. For now, let's assume request body is primary for TVariables.
    // A more robust solution might generate a specific combined type if both exist.
    defaultMutationTVariables = defaultRequestBodyType; // Or a combined type
  } else if (hasRequestBody) {
    defaultMutationTVariables = defaultRequestBodyType;
  } else if (actualParametersTypeName) {
    defaultMutationTVariables = defaultQueryParamsType;
  }
  // if pathParams are also part of variables, that needs more complex handling for TVariables type

  // Path parameters signature part for the hook factory (e.g., "id: string, categoryId: string")
  const pathParamsForFactorySignatureList = pathParams.map((p) => `${toTsIdentifier(p.name)}: string`);
  const pathParamsForFactorySignatureString = pathParamsForFactorySignatureList.join(", ");

  // Arguments to pass to the SgFunction (inner function generated by _generateFunctionFactory)
  const pathParamArgsForSgFunction = pathParams.map((p) => toTsIdentifier(p.name));

  // Indent JSDoc summary lines correctly
  const indentedSummary = summary
    .split("\n")
    .map((line) => `   * ${line}`)
    .join("\n");

  let optionsAndHookParamsString = "";
  const hookGenerics: string[] = [];
  let sgFunctionCallArgs: string[] = [...pathParamArgsForSgFunction];
  let reactQueryHookBlock = "";

  const baseQueryKeyParts = [`\'${sanitizedTagName}\'`, `\'${endpointBaseName}\'`];

  if (isMutation) {
    hookGenerics.push(`TData = ${defaultMutationTData}`);
    hookGenerics.push(`TError = Error`);
    hookGenerics.push(`TVariables = ${defaultMutationTVariables}`);
    // If a mutation has both request body and query params, TQueryParams is a separate generic for the hook.
    // TVariables will map to the request body by default in this scenario.
    if (hasRequestBody && actualParametersTypeName) {
      hookGenerics.push(`TQueryParams = ${defaultQueryParamsType}`);
    }

    const mutationHookParams: string[] = []; // Parameters for the hook factory itself
    if (pathParamsForFactorySignatureString) {
      mutationHookParams.push(pathParamsForFactorySignatureString);
    }
    // If the operation takes both body and query, the hook factory needs to accept queryParams separately
    // because TVariables will be for the request body.
    if (hasRequestBody && actualParametersTypeName) {
      mutationHookParams.push(`queryParams: TQueryParams`);
    }

    mutationHookParams.push(
      `mutationOptions?: Omit<UseMutationOptions<TData, TError, TVariables, unknown>, 'mutationFn'>`
    );
    mutationHookParams.push(`customFlags?: Record<string, any>`);
    optionsAndHookParamsString = mutationHookParams.length > 0 ? `\n    ${mutationHookParams.join(",\n    ")}\n  ` : "";

    // const mutationQueryKeyParts = [...baseQueryKeyParts, "'mutation'"]; // Not used directly for mutationFn call
    // const queryKeyDefinition = `const queryKey = [${mutationQueryKeyParts.join(", ")}] as const;`; // Not used for mutationFn

    // Arguments for the actual mutationFn: (variables: TVariables) => { ... }
    const mutationFnExecutionParams: string[] = [];
    if (defaultMutationTVariables !== "void") {
      mutationFnExecutionParams.push(`variables: TVariables`);
    }

    // Arguments to pass to the underlying sgFunction from within mutationFn
    sgFunctionCallArgs = [...pathParamArgsForSgFunction]; // Start with path parameters

    // Argument for 'data' parameter of sgFunction
    if (hasRequestBody) {
      // sgFunction expects 'data'
      // 'variables' from mutationFn (of type TVariables) is used for 'data'.
      // This is correct because TVariables defaults to defaultRequestBodyType
      // if there's a request body.
      sgFunctionCallArgs.push("variables");
    }
    // If actualRequestBodyTypeName is null, sgFunction does NOT expect a 'data' param, so nothing is added.

    // Argument for 'params' parameter of sgFunction
    if (actualParametersTypeName) {
      // sgFunction expects 'params'
      if (hasRequestBody) {
        // sgFunction also expected 'data'. 'TVariables' was for 'data'.
        // Hook has a separate TQueryParams generic, and 'queryParams' parameter in factory.
        sgFunctionCallArgs.push("queryParams");
      } else {
        // sgFunction did NOT expect 'data'. 'TVariables' is for 'params'.
        sgFunctionCallArgs.push("variables");
      }
    }
    // If actualParametersTypeName is null, sgFunction does NOT expect a 'params' param, so nothing is added.

    // Add customFlags to the end of the arguments
    sgFunctionCallArgs.push("undefined"); // callSpecificOptions placeholder
    sgFunctionCallArgs.push("customFlags");

    const finalSgFunctionCallArgsString = sgFunctionCallArgs.join(", ");

    reactQueryHookBlock = `
    const sgFunction = ${correspondingFunctionFactoryName}(requester);
    return useMutation<TData, TError, TVariables>({ 
      mutationFn: async (${mutationFnExecutionParams.join(", ")}) => {
        return sgFunction(${finalSgFunctionCallArgsString});
      },
      ...mutationOptions,
    });`;
  } else {
    hookGenerics.push(`TQueryData = ${defaultQueryTData}`);
    hookGenerics.push(`TError = Error`);
    if (actualParametersTypeName) {
      hookGenerics.push(`TQueryParams extends ${defaultQueryParamsType} = ${defaultQueryParamsType}`);
    }

    // 1. Construct the parts for the QueryKey's TYPE (as a string literal tuple)
    const queryKeyTypePartsStrings: string[] = [];
    baseQueryKeyParts.forEach((part) => queryKeyTypePartsStrings.push(part)); // e.g., `'tag'`, `'endpoint'` are already strings
    pathParams.forEach((_p) => queryKeyTypePartsStrings.push("string")); // Path params are typed as string in the key
    if (actualParametersTypeName) {
      // If queryParams object itself is part of the key, its type TQueryParams is used.
      // For queryKey type definition, we often use the actual type rather than a generic placeholder if possible,
      // but TQueryParams is appropriate here as it's a generic on the hook.
      queryKeyTypePartsStrings.push(defaultQueryParamsType); // Use the resolved default type for the alias
    }
    const queryKeyTypeString = `readonly [${queryKeyTypePartsStrings.join(", ")}]`;
    // Generate a unique name for this specific query key type to avoid collisions if multiple hooks in a file
    const specificQueryKeyTypeName = `_${toPascalCase(hookFactoryName)}_QueryKey`;

    // 2. Generate the type alias definition string
    // This type alias will be part of the string output of _generateHookFactory
    queryKeyTypeAliasDefinition = `type ${specificQueryKeyTypeName} = ${queryKeyTypeString};\n`;

    // 4. Define the runtime queryKey variable BEFORE it's used in queryOptions type
    const runtimeQueryKeyParts = [...baseQueryKeyParts, ...pathParamArgsForSgFunction];
    if (actualParametersTypeName) {
      // queryParams is a required parameter for the hook if actualParametersTypeName is true
      runtimeQueryKeyParts.push(`queryParams`);
    }
    const queryKeyDefinition = `const queryKey = [${runtimeQueryKeyParts.join(", ")}] as const;`;

    // 3. Define queryHookParams using typeof queryKey for queryOptions
    const queryHookParams: string[] = [];
    if (pathParamsForFactorySignatureString) {
      queryHookParams.push(pathParamsForFactorySignatureString);
    }
    if (actualParametersTypeName) {
      queryHookParams.push(`queryParams: TQueryParams`);
    }
    // Use the specificQueryKeyTypeName for queryOptions type, and align TQueryFnData/TData with the useQuery call
    queryHookParams.push(
      `queryOptions?: Omit<UseQueryOptions<${defaultQueryTData}, TError, TQueryData, ${specificQueryKeyTypeName}>, 'queryKey' | 'queryFn'>`
    );
    queryHookParams.push(`customFlags?: Record<string, any>`);
    optionsAndHookParamsString = queryHookParams.length > 0 ? `\n    ${queryHookParams.join(",\n    ")}\n  ` : "";

    // Construct arguments for the sgFunction call within the query
    let currentSgFunctionCallArgs_Query = [...pathParamArgsForSgFunction];
    if (actualParametersTypeName) {
      currentSgFunctionCallArgs_Query.push("queryParams");
    }
    // Add customFlags to the end of the arguments
    currentSgFunctionCallArgs_Query.push("undefined"); // callSpecificOptions placeholder
    currentSgFunctionCallArgs_Query.push("customFlags");
    const finalSgFunctionCallArgsString_Query = currentSgFunctionCallArgs_Query.join(", ");

    // 5. The useQuery call
    reactQueryHookBlock = `
    ${queryKeyDefinition} 
    const sgFunction = ${correspondingFunctionFactoryName}(requester);
    const queryFn = async (context: QueryFunctionContext<${specificQueryKeyTypeName}>) => { // Define queryFn separately for clarity, include context
      // context.queryKey, context.signal etc. are available here if needed by sgFunction
      return sgFunction(${finalSgFunctionCallArgsString_Query});
    };

    return useQuery<${defaultQueryTData}, TError, TQueryData, ${specificQueryKeyTypeName}>({ // Use specificQueryKeyTypeName here, and correct TQueryFnData vs TData
      ...queryOptions, // Spread user-provided options first
      queryKey: queryKey, // Then override with the definitive queryKey
      queryFn: queryFn,   // And the definitive queryFn
    });`;
  }

  const genericString = hookGenerics.length > 0 ? `<\n    ${hookGenerics.join(",\n    ")}\n  >` : "";

  // For query hooks, prepend the type alias definition.
  // For mutation hooks, this will be an empty string.
  const leadingDefinitions = !isMutation ? queryKeyTypeAliasDefinition : "";

  return `${leadingDefinitions}${operationGroupBanner}\nexport function ${hookFactoryName}(requester: SGSyncRequester) {\n  /**\n${indentedSummary}\n   */\n  return ${genericString}(${optionsAndHookParamsString}) => {${reactQueryHookBlock}\n  };\n}\n`;
}

// Helper to strip duplicate type/interface/enum declarations based on name
function filterAndPrefixDeclarations(tsCode: string, seenNames: Set<string>, schemaPrefix: string): string {
  const lines = tsCode.split("\n");
  const resultLines: string[] = [];
  let buffer: string[] = [];
  let currentName: string | null = null;

  const commitBuffer = () => {
    if (currentName) {
      if (!seenNames.has(currentName)) {
        resultLines.push(...buffer);
        seenNames.add(currentName);
      }
    } else {
      // Lines before the first export (rare, like comments) – keep once.
      if (buffer.length > 0) {
        resultLines.push(...buffer);
      }
    }
    buffer = [];
    currentName = null;
  };

  const exportRegex = /^export (interface|type|enum) (\w+)/;

  for (const line of lines) {
    const match = line.match(exportRegex);
    if (match) {
      // Starting a new declaration; commit previous buffer first.
      commitBuffer();
      currentName = match[2];
      // Apply prefix if not already present
      if (!currentName.startsWith(schemaPrefix)) {
        const prefixed = `${schemaPrefix}${currentName}`;
        // Replace declaration line name in buffer
        const updatedLine = line.replace(currentName, prefixed);
        buffer.push(updatedLine);
        // Replace all subsequent occurrences within buffer so far
        for (let i = 0; i < buffer.length - 1; i++) {
          buffer[i] = buffer[i].replace(new RegExp(`\\b${currentName}\\b`, "g"), prefixed);
        }
        currentName = prefixed;
        continue; // Skip pushing original line
      }
    }
    // Replace occurrences of any previously renamed types in this line
    let processedLine = line;
    seenNames.forEach((name) => {
      if (name.startsWith(schemaPrefix)) {
        const original = name.replace(schemaPrefix, "");
        processedLine = processedLine.replace(new RegExp(`\\b${original}\\b`, "g"), name);
      }
    });
    buffer.push(processedLine);
  }
  // commit remaining buffer
  commitBuffer();

  return resultLines.join("\n");
}

// Placeholder for SGSyncRequesterOptions and SGSyncRequester if not globally available in this context
// For this example, assuming they are imported or can be made available via a shared types file.
// If SGSyncRequester is part of requester-types.ts, it should be imported.
// For now, let's add a basic placeholder to satisfy the linter if it runs on this isolated snippet.
// This should be resolved by actual imports from your project structure.
type SGSyncRequester = (options: any) => Promise<any>;
interface SGSyncRequesterOptions<T = any> {
  method: string;
  url: string;
  authRequire?: boolean;
  data?: T;
  params?: any;
}
