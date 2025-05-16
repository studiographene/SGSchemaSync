import { OpenAPIV3 } from "openapi-types";
import { compile, JSONSchema } from "json-schema-to-typescript"; // Added for _generateOperationTypes
import { OperationInfo } from "../index"; // Adjust path as necessary
import { ResolvedPackageConfig } from "../config"; // Adjust path as necessary
import { toTsIdentifier } from "./generator-helpers"; // Assuming it's in the same dir or adjust

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
  generatedTypeNames: Set<string> // To track already generated type names globally for the tag
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

  // --- Generate Request Body Type ---
  if (operation.requestBody && "content" in operation.requestBody) {
    const requestBodySchema = operation.requestBody.content?.["application/json"]?.schema;
    if (requestBodySchema) {
      const typeName = `${typeBaseName}_Request`;
      actualRequestBodyTypeName = typeName;
      if (!generatedTypeNames.has(typeName)) {
        try {
          const tsType = await compile(requestBodySchema as JSONSchema, typeName, { bannerComment: "" });
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
        const typeName = `${typeBaseName}_Response${isPrimary ? "" : `_${statusCode}`}`;
        if (isPrimary) primaryResponseTypeName = typeName;

        if (!generatedTypeNames.has(typeName)) {
          try {
            const tsType = await compile(responseSchema as JSONSchema, typeName, { bannerComment: "" });
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
      const typeName = `${typeBaseName}_Parameters`;
      actualParametersTypeName = typeName;
      if (!generatedTypeNames.has(typeName)) {
        try {
          const tsType = await compile(paramsSchema, typeName, { bannerComment: "", additionalProperties: false });
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
  const defaultResponseType =
    primaryResponseTypeName && primaryResponseTypeName !== "void"
      ? `${tagImportName}.${primaryResponseTypeName}`
      : "void";
  const defaultRequestBodyType = actualRequestBodyTypeName ? `${tagImportName}.${actualRequestBodyTypeName}` : "never";
  const defaultQueryParamsType = actualParametersTypeName ? `${tagImportName}.${actualParametersTypeName}` : "never";

  // Path parameters signature part (e.g., "id: string, categoryId: string")
  const pathParamsForInnerFuncSignature = pathParams.map((p) => `${toTsIdentifier(p.name)}: string`);

  const innerFuncParamsList: string[] = [...pathParamsForInnerFuncSignature];

  if (actualRequestBodyTypeName) {
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
  if (actualRequestBodyTypeName) {
    callSpecificOptionsOmitParts += " | 'data'";
  }
  if (actualParametersTypeName) {
    callSpecificOptionsOmitParts += " | 'params'";
  }
  const callSpecificOptionsType = `Partial<Omit<SGSyncRequesterOptions<TRequestBody>, ${callSpecificOptionsOmitParts}>>`;

  innerFuncParamsList.push(`callSpecificOptions?: ${callSpecificOptionsType}`);

  const innerFuncParamsString =
    innerFuncParamsList.length > 0 ? `\n    ${innerFuncParamsList.join(",\n    ")}\n  ` : "";

  const urlPath = processedPath.replace(/{([^}]+)}/g, (_match, paramNameInPath) => {
    const sanitizedParamName = toTsIdentifier(paramNameInPath);
    return `\\\${${sanitizedParamName}}`; // Corrected template literal placeholder
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
  const warningBlock = warnings.length > 0 ? `${warnings.join("\\n")}\\n` : "";

  // Indent JSDoc summary lines correctly
  const indentedSummary = summary
    .split("\\n")
    .map((line) => `   * ${line}`)
    .join("\\n");

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
        actualRequestBodyTypeName
          ? `
      data,`
          : ""
      }${
        actualParametersTypeName
          ? `
      params,`
          : ""
      }
      ...(callSpecificOptions || {}),
    });
${defaultResponseType === "void" ? "    return;" : "    return response.data;"}
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
  // Path parameters of the operation
  pathParams: OpenAPIV3.ParameterObject[],
  packageConfig: ResolvedPackageConfig // For verbose logging or future options
): string {
  const { method } = opInfo;
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase());

  // Default Type Names for Generics
  const defaultResponseType =
    primaryResponseTypeName && primaryResponseTypeName !== "void"
      ? `${tagImportName}.${primaryResponseTypeName}`
      : "void";
  const defaultRequestBodyType = actualRequestBodyTypeName ? `${tagImportName}.${actualRequestBodyTypeName}` : "never";
  const defaultQueryParamsType = actualParametersTypeName ? `${tagImportName}.${actualParametersTypeName}` : "never";

  // React Query specific types
  const defaultQueryTData = defaultResponseType;
  const defaultMutationTData = defaultResponseType; // Often, mutation result is same as response type
  // For mutations, TVariables often includes path params + request body + query params
  // For simplicity here, we'll make TVariables primarily about the request body or a combined object if needed.
  // The actual function called by the mutation will handle separating these.

  let defaultMutationTVariables = "void";
  if (actualRequestBodyTypeName && actualParametersTypeName) {
    // Need a way to combine these. For now, let's assume request body is primary for TVariables.
    // A more robust solution might generate a specific combined type if both exist.
    defaultMutationTVariables = defaultRequestBodyType; // Or a combined type
  } else if (actualRequestBodyTypeName) {
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
    if (actualParametersTypeName && !actualRequestBodyTypeName) {
      // If mutation uses query params and NOT a request body, TQueryParams are the TVariables.
    } else if (actualParametersTypeName) {
      hookGenerics.push(`TQueryParams = ${defaultQueryParamsType}`);
    }

    const mutationHookParams: string[] = [];
    if (pathParamsForFactorySignatureString) {
      mutationHookParams.push(pathParamsForFactorySignatureString);
    }
    if (actualParametersTypeName && actualRequestBodyTypeName) {
      mutationHookParams.push(`queryParams?: TQueryParams`);
    }

    mutationHookParams.push(
      `mutationOptions?: Omit<UseMutationOptions<TData, TError, TVariables, unknown>, \'mutationFn\'>`
    );
    optionsAndHookParamsString = mutationHookParams.length > 0 ? `\n    ${mutationHookParams.join(",\n    ")}\n  ` : "";

    // For mutations, queryKey is often static or based on broader categories for invalidation.
    // Simplest approach: const queryKey = ['TAG_NAME', 'ENDPOINT_BASE_NAME', 'mutation'] as const;
    const mutationQueryKeyParts = [...baseQueryKeyParts, "\'mutation\'"];
    const queryKeyDefinition = `const queryKey = [${mutationQueryKeyParts.join(", ")}] as const;`; // Corrected: simple static key for mutations

    const mutationFnParams: string[] = [];
    if (actualRequestBodyTypeName && actualParametersTypeName) {
      sgFunctionCallArgs = []; // Reset and handle explicitly for complex TVariables
      // This case needs TVariables to be an object like { data: TRequestBody, params: TQueryParams, ...pathArgs }
      // For now, simplifying: assumes TVariables is effectively TRequestBody or similar simple type.
      // User might need to destructure TVariables in their calling code or function adapter.
      mutationFnParams.push(`variables: TVariables`);
      // We need to map `variables` to pathParams, data, and queryParams for the sgFunction
      // This is a complex part if TVariables is a single object. The current _generateFunctionFactory
      // expects distinct path, data, params arguments.
      // Let's assume for now TVariables is just TRequestBody if it exists, and path/query params are passed separately if needed.
      // This part of TVariables handling will need refinement for complex cases.
      sgFunctionCallArgs.push(...pathParamArgsForSgFunction); // Path params are from factory scope
      sgFunctionCallArgs.push(`variables`); // Assuming TVariables is TRequestBody
      if (actualParametersTypeName) {
        // If mutation also has query params, TVariables might need to be { body: TRequestBody, query: TQueryParams }
        // or the hook needs separate queryParams argument.
        // For now, this is simplified, assuming queryParams are not part of TVariables directly.
        // This means if a mutation has query params, the hook factory might need queryParams in its own signature.
        // Let's add TQueryParams to mutation and pass it through.
        // sgFunctionCallArgs.push(`queryParams`); // if TQueryParams is made available
      }
    } else if (actualRequestBodyTypeName) {
      mutationFnParams.push(`variables: TVariables`); // TVariables is TRequestBody
      sgFunctionCallArgs.push(...pathParamArgsForSgFunction);
      sgFunctionCallArgs.push(`variables`);
    } else if (actualParametersTypeName) {
      mutationFnParams.push(`variables: TVariables`); // TVariables is TQueryParams
      sgFunctionCallArgs.push(...pathParamArgsForSgFunction);
      // No 'data' for sgFunction, just params
      sgFunctionCallArgs.push(`variables`); // this would map to 'params' in sgFunction
    } else {
      // No request body, no query params
      // Path params are the only dynamic part here, but they are from factory scope.
      // If a mutation truly takes no variables (only path params), TVariables is void.
      // The sgFunction will just take path params.
      sgFunctionCallArgs.push(...pathParamArgsForSgFunction);
      if (defaultMutationTVariables !== "void") {
        // Should be void if no body/params
        mutationFnParams.push(`variables: TVariables`);
        // This case is tricky: if TVariables is not void but there's no body/params, what is it?
        // Assuming sgFunction expects nothing or only callSpecificOptions.
        // For now, let's assume if variables exist, they are passed.
        sgFunctionCallArgs.push(`variables`);
      }
    }
    // Add callSpecificOptions to sgFunction if TVariables is not handling it
    // sgFunctionCallArgs.push(`{ ...callSpecificOptionsFromVariables }`);

    const finalSgFunctionCallArgs = sgFunctionCallArgs.join(", ");

    reactQueryHookBlock = `
    const sgFunction = ${correspondingFunctionFactoryName}(requester);
    return useMutation<TData, TError, TVariables>({ 
      mutationFn: async (${mutationFnParams.join(", ")}) => {
        return sgFunction(${finalSgFunctionCallArgs});
      },
      ...mutationOptions,
    });`;
  } else {
    // Query (GET)
    hookGenerics.push(`TQueryData = ${defaultQueryTData}`);
    hookGenerics.push(`TError = Error`);
    // Queries can have TQueryParams for their parameters argument
    if (actualParametersTypeName) {
      hookGenerics.push(`TQueryParams = ${defaultQueryParamsType}`);
    }

    const queryHookParams: string[] = [];
    if (pathParamsForFactorySignatureString) {
      queryHookParams.push(pathParamsForFactorySignatureString);
    }
    if (actualParametersTypeName) {
      queryHookParams.push(`queryParams: TQueryParams`);
      sgFunctionCallArgs.push(`queryParams`);
    }
    queryHookParams.push(
      `queryOptions?: Omit<UseQueryOptions<TQueryData, TError, TQueryData, readonly unknown[]>, 'queryKey' | 'queryFn'>`
    );
    optionsAndHookParamsString = queryHookParams.length > 0 ? `\n    ${queryHookParams.join(",\n    ")}\n  ` : "";

    // Query key includes path params from factory and queryParams from hook args
    const queryKeyParts = [...baseQueryKeyParts, ...pathParamArgsForSgFunction];
    if (actualParametersTypeName) {
      queryKeyParts.push(`...(queryParams ? [queryParams] : [])`);
    }
    const queryKeyDefinition = `const queryKey = [${queryKeyParts.join(", ")}] as const;`; // This is for queries, ensure it's scoped correctly
    const finalSgFunctionCallArgsString = sgFunctionCallArgs.join(", ");

    reactQueryHookBlock = `
    ${queryKeyDefinition} // This will be the query one, ensure scope
    const sgFunction = ${correspondingFunctionFactoryName}(requester);
    return useQuery<TQueryData, TError, TQueryData, typeof queryKey>({ 
      queryKey,
      queryFn: async () => {
        return sgFunction(${finalSgFunctionCallArgsString});
      },
      ...queryOptions,
    });`;
  }

  const genericString = hookGenerics.length > 0 ? `<\n    ${hookGenerics.join(",\n    ")}\n  >` : "";

  return `${operationGroupBanner}\nexport function ${hookFactoryName}(requester: SGSyncRequester) {\n  /**\n${indentedSummary}\n   */\n  return ${genericString}(${optionsAndHookParamsString}) => {${reactQueryHookBlock}\n  };\n}\n`;
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
