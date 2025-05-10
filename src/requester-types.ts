// src/requester-types.ts

/**
 * Defines the options structure that generated API function factories
 * will pass to the provided requester function.
 */
export interface SGSyncRequesterOptions {
  method: string; // e.g., 'get', 'post'. Consider using OpenAPIV3.HttpMethods if available and desired.
  url: string; // Relative path from the OpenAPI specification.
  data?: any; // Request body, typically for POST, PUT, PATCH.
  params?: Record<string, any>; // Query parameters.
  authRequire?: boolean; // Indicates if authentication is expected for this request.
  headers?: Record<string, string>; // Request headers.
  // Allows for additional properties to be passed through,
  // potentially for Axios-specific configurations or other requester needs.
  [key: string]: any;
}

/**
 * Defines the expected structure of a response that the requester function
 * should return. This aligns with common properties of AxiosResponse.
 */
export interface SGSyncResponse<T = any> {
  data: T; // The payload of the response.
  status: number; // HTTP status code.
  statusText: string; // HTTP status text.
  headers: Record<string, string>; // Response headers.
  // The original request options that led to this response.
  // Useful for debugging or advanced handling in interceptors or retry logic.
  // This was previously commented out, but it's good practice to include.
  config: SGSyncRequesterOptions;
  // Allows for other properties that might be part of the response from a specific requester.
  [key: string]: any;
}

/**
 * Defines the function signature for a requester.
 * Generated API client functions will be factories that accept a function of this type.
 * This requester is responsible for making the actual HTTP call.
 * @template T The expected type of the response data.
 * @param options The options for the HTTP request.
 * @returns A Promise that resolves to an SGSyncResponse containing the data and response details.
 */
export type SGSyncRequester = <T = any>(options: SGSyncRequesterOptions) => Promise<SGSyncResponse<T>>;
