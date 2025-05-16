// src/default-requester.ts
import axios, { AxiosRequestConfig, AxiosResponse, Method as AxiosMethod } from "axios";
import { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from "./requester-types";

export interface DefaultSGSyncRequesterConfig {
  baseURL?: string;
  getToken?: () => string | null | Promise<string | null>;
  // timeout?: number; // Future consideration: pass more Axios-like configs
}

export const createDefaultSGSyncRequester = (config?: DefaultSGSyncRequesterConfig): SGSyncRequester => {
  // The core request logic, now private to this factory
  async function doRequest<TResponseData = any, TRequestBody = any, TQueryParams = any>(
    options: SGSyncRequesterOptions<TRequestBody, TQueryParams>
  ): Promise<SGSyncResponse<TResponseData>> {
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
      }
    }

    if (typeof window === "undefined" && typeof process !== "undefined" && process.versions && process.versions.node) {
      try {
        const response: AxiosResponse<TResponseData> = await axios(axiosOptions);
        return {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers as Record<string, string>,
          config: options,
          originalResponse: response,
        };
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
          return {
            data: error.response.data as TResponseData,
            status: error.response.status,
            statusText: error.response.statusText,
            headers: error.response.headers as Record<string, string>,
            config: options,
            originalResponse: error.response,
            isError: true,
          };
        }
        console.error("[DefaultSGSyncRequester] Axios request failed:", error);
        // Instead of rethrowing, return a structured error response
        return {
          data: null as TResponseData,
          status: error.response?.status || 0,
          statusText: error.message || "Axios request failed without response",
          headers: (error.response?.headers as Record<string, string>) || {},
          config: options,
          isError: true,
          originalResponse: error.response || error,
        };
      }
    } else {
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
        signal: axiosOptions.signal as AbortSignal | undefined | null,
      };

      try {
        const response = await fetch(fullUrl, fetchOptions);
        const responseData = await response.json().catch(() => undefined);

        if (!response.ok) {
          return {
            data: responseData as TResponseData, // or null if error shape is preferred
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            config: options,
            isError: true,
            originalResponse: response,
          };
        }

        return {
          data: responseData as TResponseData,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          config: options,
          originalResponse: response,
        };
      } catch (error: any) {
        console.error("[DefaultSGSyncRequester] Fetch request failed:", error);
        return {
          data: null as TResponseData,
          status: 0,
          statusText: error.message || "Fetch request failed",
          headers: {},
          config: options,
          isError: true,
          originalResponse: error,
        };
      }
    }
  }

  // Return an object that implements the SGSyncRequester interface
  return {
    request: doRequest,
  };
};
