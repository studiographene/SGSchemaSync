// src/requester-types.ts

/**
 * Defines the options structure that generated API function factories
 * will pass to the provided requester's 'request' method.
 */
export interface SGSyncRequesterOptions<TRequestBody = any, TQueryParams = any> {
  method: string; // e.g., 'get', 'post'. Consider using OpenAPIV3.HttpMethods if available and desired.
  url: string; // Relative path from the OpenAPI specification.
  data?: TRequestBody; // Request body, typically for POST, PUT, PATCH.
  params?: TQueryParams; // Query parameters.
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
export interface SGSyncResponse<TResponseData = any> {
  data: TResponseData; // The payload of the response.
  status: number; // HTTP status code.
  statusText: string; // HTTP status text.
  headers: Record<string, string>; // Response headers.
  // The original request options that led to this response.
  // Useful for debugging or advanced handling in interceptors or retry logic.
  // This was previously commented out, but it's good practice to include.
  config: SGSyncRequesterOptions<any, any>;
  originalResponse?: any; // Optional: The original driver's response
  isError?: boolean; // Optional: to indicate an error response that is structurally similar to a success response
  // Allows for other properties that might be part of the response from a specific requester.
  [key: string]: any;
}

/**
 * Defines the interface for a requester object.
 * Generated API client functions will be factories that accept an object conforming to this interface.
 * This requester is responsible for making the actual HTTP call via its 'request' method.
 */
export interface SGSyncRequester {
  /**
   * Makes an HTTP request.
   * @template TResponseData The expected type of the response data.
   * @template TRequestBody The type of the request body.
   * @template TQueryParams The type of the query parameters.
   * @param options The options for the HTTP request.
   * @returns A Promise that resolves to an SGSyncResponse containing the data and response details.
   */
  request: <TResponseData = any, TRequestBody = any, TQueryParams = any>(
    options: SGSyncRequesterOptions<TRequestBody, TQueryParams>
  ) => Promise<SGSyncResponse<TResponseData>>;
}

export interface SGSyncRequesterContext {
  [key: string]: any;
  baseURL?: string;
  requesterFlags?: Record<string, any>;
}
