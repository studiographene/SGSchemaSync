// src/default-requester.ts
import axios, { AxiosRequestConfig, AxiosResponse, Method as AxiosMethod } from "axios";
import { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from "./requester-types";

export interface DefaultSGSyncRequesterConfig {
  baseURL?: string;
  getToken?: () => string | null | Promise<string | null>;
  // timeout?: number; // Future consideration: pass more Axios-like configs
}

export const createDefaultSGSyncRequester = (config?: DefaultSGSyncRequesterConfig): SGSyncRequester => {
  return async <T = any>(options: SGSyncRequesterOptions): Promise<SGSyncResponse<T>> => {
    const { url, method, params, data, authRequire, headers: sgHeaders, ...rest } = options;

    let effectiveBaseURL = config?.baseURL || "";
    if (typeof process !== "undefined" && process.env?.SG_SYNC_BASE_URL && !effectiveBaseURL) {
      effectiveBaseURL = process.env.SG_SYNC_BASE_URL;
    }

    const axiosOptions: AxiosRequestConfig = {
      url: url,
      method: method as AxiosMethod,
      params: params,
      data: data,
      headers: { ...sgHeaders },
      ...rest,
    };

    if (effectiveBaseURL && !(url.startsWith("http://") || url.startsWith("https://"))) {
      axiosOptions.baseURL = effectiveBaseURL;
    }

    if (authRequire && config?.getToken) {
      try {
        const token = await config.getToken();
        if (token) {
          axiosOptions.headers = {
            ...axiosOptions.headers,
            Authorization: `Bearer ${token}`,
          };
        } else {
          console.warn(
            `[DefaultSGSyncRequester] Auth required for ${method.toUpperCase()} ${url}, but no token was returned by getToken.`
          );
        }
      } catch (tokenError) {
        console.error(`[DefaultSGSyncRequester] Error getting token for ${method.toUpperCase()} ${url}:`, tokenError);
        // Potentially rethrow or handle as a failed request if token is critical
      }
    }

    // Environment check: Node.js vs. Browser-like for fetch
    if (typeof window === "undefined" && typeof process !== "undefined" && process.versions && process.versions.node) {
      // Node.js environment: Use Axios
      try {
        const response: AxiosResponse<T> = await axios(axiosOptions);
        // Adapt AxiosResponse to SGSyncResponse
        return {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers as Record<string, string>,
          config: options, // Original SGSyncRequesterOptions
        };
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
          return {
            data: error.response.data as T,
            status: error.response.status,
            statusText: error.response.statusText,
            headers: error.response.headers as Record<string, string>,
            config: options,
          };
        }
        // For non-Axios errors or errors without a response, rethrow or adapt to SGSyncResponse
        console.error("[DefaultSGSyncRequester] Axios request failed:", error);
        throw error; // Or construct an SGSyncResponse indicating failure
      }
    } else {
      // Browser-like environment: Use Fetch API
      let fullUrl = url;
      if (effectiveBaseURL && !(url.startsWith("http://") || url.startsWith("https://"))) {
        fullUrl = `${effectiveBaseURL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
      }

      if (axiosOptions.params) {
        const queryParams = new URLSearchParams(axiosOptions.params as any).toString();
        if (queryParams) {
          fullUrl += `?${queryParams}`;
        }
      }

      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: axiosOptions.headers as HeadersInit,
        body: data ? JSON.stringify(data) : undefined,
        signal: axiosOptions.signal as AbortSignal | undefined | null, // Pass AbortSignal if available
      };

      try {
        const response = await fetch(fullUrl, fetchOptions);
        const responseData = await response.json().catch(() => ({})); // Handle non-JSON or empty

        return {
          data: responseData as T,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          config: options,
        };
      } catch (error: any) {
        console.error("[DefaultSGSyncRequester] Fetch request failed:", error);
        // Construct a basic error SGSyncResponse or rethrow
        // This part might need more sophisticated error shaping for fetch
        throw error;
      }
    }
  };
};
