# SGSchema-Sync

A CLI tool to generate type-safe TypeScript API client code from an OpenAPI v3 specification.

This tool parses an OpenAPI JSON or YAML file (local or remote) and generates:
*   TypeScript interfaces for request bodies, parameters, and responses.
*   **Factory functions** for creating API call functions.
*   Optionally, **factory functions** for TanStack Query (v4/v5) hooks.
*   An **auto-generated and always overwritten client module per API tag** (e.g., `user/client.ts`) that orchestrates these factories with a configured requester (either a default one or your custom implementation).
*   An optional, **scaffolded custom requester file** (e.g., `schema-sync-requester.ts` in your main output directory) if you opt out of the default requester and the file doesn't already exist. This scaffold provides a lean starting point for your custom HTTP logic.

Files are organized into **tag-based directories**, where the tag is determined by the first `tag` associated with each endpoint in the OpenAPI specification. Each tag directory also includes a main `index.ts` barrel file re-exporting types and the instantiated client functions/hooks.

## Key Features & Approach

SGSchema-Sync now employs a **factory-based approach** for generating API functions and hooks, coupled with a flexible requester system:

1.  **Core Generation (Factories):**
    *   `functions.ts` (per tag): Contains factory functions (e.g., `createGetProductFunction(requester)`) for each API operation. These factories take an `SGSyncRequester` instance and return an actual async function to call the API.
    *   `hooks.ts` (per tag, if `generateHooks: true`): Contains factory functions (e.g., `createUseGetProductHook(requester)`) for TanStack Query hooks. These also take an `SGSyncRequester`.
    *   `types.ts` (per tag): Contains all TypeScript request/response types for that tag's operations.

2.  **Requester Abstraction (`SGSyncRequester`):**
    *   The generated factories depend on an `SGSyncRequester` **interface** (defined in `sg-schema-sync/requester-types`). This interface mandates an object with a `request` method responsible for making the actual HTTP request.
    *   You have two main options for providing this requester:
        *   **Default Requester (`useDefaultRequester: true`):**
            *   The tool provides a default requester (`createDefaultSGSyncRequester`) based on Axios/Fetch.
            *   You must configure `defaultRequesterConfig.getTokenModulePath` (and optionally `defaultRequesterConfig.getTokenExportName`) in your `sg-schema-sync.config.js` to point to your module that exports a `getToken(): Promise<string | null>` function for handling authentication. The `baseURL` from your config is also used.
        *   **Custom Requester (`useDefaultRequester: false`):**
            *   You provide your own `SGSyncRequester` implementation (an object with a `request` method).
            *   This is configured via `customRequesterConfig.filePath` (e.g., `src/api/schema-sync-requester.ts`) and `customRequesterConfig.exportName` (e.g., `myCustomSGSyncRequester`) in your `sg-schema-sync.config.js`.

3.  **Per-Tag Orchestration Client Module (e.g., `user/client.ts`):**
    *   For each API tag, a central client module (e.g., `user/client.ts`, filename configurable via `generatedClientModuleBasename`) is automatically generated and **overwritten on each run**.
    *   This module imports the necessary function/hook factories for the tag (from `./functions.ts` and `./hooks.ts`).
    *   It then imports and configures the chosen requester:
        *   If using the **default requester**, it imports `createDefaultSGSyncRequester` and your `getToken` function (from the configured path), instantiates the default requester with `baseURL` and `getToken`.
        *   If using a **custom requester**, it imports your custom requester **object** (conforming to `SGSyncRequester`) from the configured path and export name.
    *   Finally, it instantiates all factories with this chosen requester and exports the ready-to-use API functions and hooks for that tag.

4.  **Scaffolding for Custom Requesters (`schema-sync-requester.ts`):**
    *   If you set `useDefaultRequester: false` and `scaffoldRequesterAdapter: true` (default), and the file specified in `customRequesterConfig.filePath` does not exist, the tool will generate a **lean scaffold file** (default name: `schema-sync-requester.ts`, placed in your main output directory).
    *   This scaffold provides a basic `SGSyncRequester` object boilerplate. It is **your responsibility** to fill in the actual HTTP request logic in its `request` method. This file is user-owned and will not be overwritten once created.

5.  **Barrel Exports (`index.ts` per tag):**
    *   Each tag directory (e.g., `users/`) gets an `index.ts` that re-exports all types from `types.ts` and all instantiated functions/hooks from the `client.ts` module for easy importing.

## Installation

### From GitHub (Recommended for Development)

Install the tool as a development dependency directly from its GitHub repository using PNPM:

```bash
# Using SSH (if you have SSH keys configured with GitHub):
pnpm add -D git+ssh://git@github.com/diogo-SG/SGSchemaSync.git#main

# Or using HTTPS:
pnpm add -D git+https://github.com/diogo-SG/SGSchemaSync.git#main

# Replace #main with the desired branch, tag, or commit hash if needed.
```

### From NPM (Once Published)

If the package is published to NPM, you can install it like this:

```bash
pnpm add -D sg-schema-sync 
```

### Local Linking (For Active Development of the Generator Itself)

If you are actively developing this generator tool itself and want to test it in another local project without publishing, you can use `pnpm link`:

1.  Navigate to this `sg-schema-sync` project directory and run:
    ```bash
    pnpm link --global
    ```
2.  Navigate to the project where you want to use the generator and run:
    ```bash
    pnpm link --global sg-schema-sync
    ```

This creates a symbolic link, allowing the other project to use your local version. Remember to rebuild the generator (`pnpm build`) after making changes. Ensure the pnpm global bin directory (`pnpm bin -g`) is in your `$PATH`.

## Usage

Run the generator from the root of your project using the command exposed via `pnpm`:

```bash
# Example:
pnpm sg-schema-sync -i <path_or_url_to_openapi_spec> -o ./src/api/generated
```

**Options:**

*   `-i, --input <path_or_url>`: (Required) Path to a local OpenAPI JSON file or a URL pointing to one (this can serve as a fallback or override for `baseURL` if not specified in the config file).
*   `-o, --output <directory>`: (Required) The base output directory where the tag-based generated folders will be placed (relative to the current working directory).
*   `--config <path>`: (Optional) Path to a JavaScript configuration file (e.g., `sg-schema-sync.config.js`). If not provided, the tool will automatically look for `sg-schema-sync.config.js` in the current working directory. This file can export configuration options to customize fetching the OpenAPI spec and other aspects of generation.
*   `--prettier / --no-prettier`: (Optional) Enable or disable Prettier formatting for the generated files. Defaults to enabled. This overrides the `formatWithPrettier` setting in the config file.
*   `--prettier-config-path <path>`: (Optional) Path to a custom Prettier configuration file (e.g., `.prettierrc.json`, `prettier.config.js`). If provided, this overrides the `prettierConfigPath` setting in the config file and Prettier's default config discovery.
*   `--custom-requester-file-path <path>`: (Optional) Specifies the path for the custom requester file (e.g., `src/api/my-requester.ts`). Used when `useDefaultRequester` is `false`. If a relative path is given, it's resolved from the main output directory (specified by `-o`). Absolute paths are used as-is. Overrides `customRequesterConfig.filePath` in the config file.
*   `--custom-requester-export-name <name>`: (Optional) Specifies the export name of your custom requester function within the file specified by `--custom-requester-file-path`. Defaults to `customSGSyncRequester`. Overrides `customRequesterConfig.exportName` in the config file.
*   `--scaffold-requester / --no-scaffold-requester`: (Optional) When `useDefaultRequester` is `false`, this flag controls whether a scaffold for the custom requester file is generated if it doesn't already exist. Defaults to enabled. Overrides `scaffoldRequesterAdapter` in the config file.
*   `--default-requester-token-module-path <path>`: (Optional) Specifies the module path to your `getToken` function, used when `useDefaultRequester` is `true`. (e.g., `src/auth/tokenStore`). Overrides `defaultRequesterConfig.getTokenModulePath` in the config file.
*   `--default-requester-token-export-name <name>`: (Optional) Specifies the export name of your `getToken` function. Defaults to `getToken`. Overrides `defaultRequesterConfig.getTokenExportName` in the config file.
*   `--generated-client-module-basename <name>`: (Optional) Basename for the auto-generated per-tag client orchestrator module (e.g., `client` would result in `users/client.ts`). Defaults to `client`. Overrides `generatedClientModuleBasename` in the config file.
*   `--strip-path-prefix <prefix>`: (Optional) A string prefix to strip from the beginning of all paths obtained from the OpenAPI specification before they are used for generating runtime request paths and influencing generated names (like hook names or query keys if they are path-based). For example, if your OpenAPI paths are `/api/users` and you provide `--strip-path-prefix /api`, the generated path constants will be `/users`. Type names (e.g., `_Request`, `_Response` types) will still be based on the original, unstripped path to maintain naming consistency. Defaults to no prefix stripping. Overrides `stripPathPrefix` in the config file.
*   `operationTypePrefix?: string`: (Default: none) Optional prefix prepended to every *operation-specific* type that the generator creates (e.g. `GetUsers_Request`, `PostPets_Response_201`).  Provide a short Pascal-case string; if omitted, the old names are preserved.
*   `schemaTypePrefix?: string`: (Default: `SSGEN_`) Prefix prepended to every auxiliary type that originates from `$ref` schemas (interfaces like `UserRoleInfo`, enums, etc.).  This prevents clashes when multiple specs are compiled inside the same code-base.

## Configuration File (`sg-schema-sync.config.js`)

Provide advanced options via a JavaScript file (default: `sg-schema-sync.config.js` in your project root, or specify with `--config`).
It should export a `config` object: `module.exports = { config: { /* ... */ } };` or just the package config directly: `module.exports = { packageConfig: { /* ... */ } };` or `module.exports = { /* ... */ };` (if it's the `PackageConfig` structure).

**`PackageConfig` options (can be nested under `config.packageConfig` or be the top-level export):**

*   `input: string`: (Required) Path to a local OpenAPI JSON/YAML file or a URL.
*   `outputDir: string`: (Required) The base output directory.
*   `baseURL: string`: Base URL for the API (used by the default requester).
*   `generateFunctions: boolean`: (Default: `true`) Controls whether API client function factory functions are generated in `functions.ts` files.
*   `generateFunctionNames: string`: Template for generated function factory names (e.g., `create{Method}{Endpoint}Function`). Default: `create{Method}{Endpoint}Function`.
*   `generateTypesNames: string`: Template for generated type names. Default: `{Method}{Endpoint}Types`.
*   `generateHooksNames: string`: Template for generated hook factory names. Default: `createUse{Method}{Endpoint}Hook`.
*   `generateHooks: boolean`: (Default: `true`) Controls whether TanStack Query (v4/v5) hook factory functions are generated in `hooks.ts` files.
*   `useDefaultRequester: boolean`: (Default: `true`)
    *   If `true`, the auto-generated per-tag client module (e.g., `users/client.ts`) will use a built-in default requester. You **must** provide `defaultRequesterConfig`.
    *   If `false`, the client module will use your custom requester. You **must** provide `customRequesterConfig`.
*   `defaultRequesterConfig: { getTokenModulePath: string; getTokenExportName?: string; }`: (Required if `useDefaultRequester: true`)
    *   `getTokenModulePath: string`: Path to the module exporting your `getToken` function (e.g., `src/utils/auth` or `@/utils/auth`). This module should export a function that returns `Promise<string | null>`.
    *   `getTokenExportName?: string`: (Default: `getToken`) The named export of your token function from `getTokenModulePath`.
*   `customRequesterConfig: { filePath: string; exportName: string; }`: (Required if `useDefaultRequester: false`)
    *   `filePath: string`: Path to your custom requester file (e.g., `src/api/schema-sync-requester.ts`). If relative, it's resolved from the `outputDir`.
    *   `exportName: string`: The named export of your custom `SGSyncRequester` function from `filePath`.
*   `scaffoldRequesterAdapter: boolean`: (Default: `true`) When `useDefaultRequester` is `false`, if this is `true` and the file at `customRequesterConfig.filePath` does not exist, the tool will generate a lean scaffold for it. This file will not be overwritten if it already exists.
*   `generatedClientModuleBasename: string`: (Default: `client`) Basename for the auto-generated, per-tag client orchestrator module (e.g., `client` results in `users/client.ts`).
*   `formatWithPrettier: boolean`: (Default: `true`) Whether to format the generated output files using Prettier.
*   `prettierConfigPath: string | undefined`: (Default: `undefined`) Path to a custom Prettier configuration file.
*   `stripPathPrefix: string | undefined`: (Default: `undefined`) Optional string prefix to strip from paths.
*   `operationTypePrefix?: string`: (Default: none) Optional prefix prepended to every *operation-specific* type that the generator creates (e.g. `GetUsers_Request`, `PostPets_Response_201`).  Provide a short Pascal-case string; if omitted, the old names are preserved.
*   `schemaTypePrefix?: string`: (Default: `SSGEN_`) Prefix prepended to every auxiliary type that originates from `$ref` schemas (interfaces like `UserRoleInfo`, enums, etc.).  This prevents clashes when multiple specs are compiled inside the same code-base.
*   *(Other fields like `defaultConfig` from the CLI are also part of `PackageConfig` but usually set via CLI or have sensible defaults).*

**Example `sg-schema-sync.config.js`:**
```javascript
// sg-schema-sync.config.js
module.exports = {
  // config can be at top level if it's the PackageConfig structure
  // or nested under packageConfig for clarity / other top-level config sections in future
  // packageConfig: { 
  input: 'https://petstore3.swagger.io/api/v3/openapi.json',
  outputDir: './src/api/schema-sync', // Main output directory
  baseURL: 'https://petstore3.swagger.io/api/v3', // For default requester

  generateHooks: true,
  useDefaultRequester: true, // Set to true to use default requester

  // Required if useDefaultRequester is true:
  defaultRequesterConfig: {
    getTokenModulePath: '@/lib/auth', // Path to your module with getToken
    // getTokenExportName: 'getMyAuthToken', // Optional: if your function isn't named 'getToken'
  },

  // Required if useDefaultRequester is false:
  // customRequesterConfig: {
  //   filePath: 'src/api/my-custom-requester.ts', // Path to your custom requester, relative to outputDir if not absolute
  //   exportName: 'myCustomSGSyncRequester',     // Export name of your requester function
  // },
  // scaffoldRequesterAdapter: true, // Default is true, scaffolds customRequesterConfig.filePath if it doesn't exist

  generatedClientModuleBasename: 'client', // Results in e.g. user/client.ts
  // formatWithPrettier: true, // Default is true
  // prettierConfigPath: '.prettierrc.custom.json',
  // stripPathPrefix: "/api/v3",
  // } // end of packageConfig if you used that nesting
};
```

**Configuration Precedence:**
1.  CLI arguments.
2.  Values from `sg-schema-sync.config.js`.
3.  Internal defaults.

## Generated File Structure

After generation, all `.ts` files in the output directory will be formatted using Prettier (if enabled).

For an API with tags `Users` and `Products`, and `outputDir` set to `src/api/schema-sync`:

```
src/api/schema-sync/
├── users/
│   ├── index.ts        # Exports * from './types' and * from './client'
│   ├── types.ts        # TypeScript interfaces for Users API
│   ├── functions.ts    # Exports *factory functions* for Users API calls
│   ├── hooks.ts        # Optional: Exports *factory functions* for Users TanStack Query hooks
│   └── client.ts       # Auto-generated: Imports factories & chosen requester, exports instantiated functions/hooks
├── products/
│   ├── index.ts
│   ├── types.ts
│   ├── functions.ts
│   ├── hooks.ts        # Optional
│   └── client.ts
├── schema-sync-requester.ts # Optional: Scaffold for custom requester if useDefaultRequester=false,
│                            # scaffoldRequesterAdapter=true, and file doesn't exist.
│                            # (Filename and path from customRequesterConfig.filePath)
└── # ... other tags
```

## Generated Code Deep Dive

### 1. `types.ts` (per tag)
Contains TypeScript interfaces for request bodies, path/query parameters, and responses. (Naming often based on `generateTypesNames` template, e.g., `GetUserByIdTypes_Response`).

### 2. `functions.ts` (per tag - Core Factories)
*   Exports **factory functions** for each API operation, e.g., `export const createGetUserByIdFunction = (requester: SGSyncRequester) => { /* returns async func */ };`
*   Each factory takes an `SGSyncRequester` argument.
*   The returned async function (e.g., `getUserById`) is **generic**, allowing for type overrides (see "Type Overriding with Generics" below). It takes path parameters, data (if applicable), query params (if applicable), and `callSpecificOptions`. It constructs `SGSyncRequesterOptions` (including `authRequired: boolean` derived from your OpenAPI spec's `security` definitions) and calls the provided `requester`.
*   The returned function's promise resolves with an `SGSyncResponse<ResponseType>`.
*   **`SGSyncRequester`, `SGSyncRequesterOptions`, `SGSyncResponse`**: These crucial types define the contract for the requester mechanism. They are exported by the `sg-schema-sync` package (or available locally if you copy them) for you to implement a custom requester or understand the default one.

### 3. `hooks.ts` (per tag - React Query Factories)
*(Generated only if `generateHooks: true`)*
*   Exports **factory functions** for TanStack Query hooks, e.g., `export const createUseGetUserByIdHook = (requester: SGSyncRequester) => { /* returns hook */ };`
*   Each factory takes an `SGSyncRequester`.
*   The returned hook is **generic** (see "Type Overriding with Generics" below). It internally uses the corresponding function factory (e.g., `createGetUserByIdFunction`) to get an API call function, then uses it in `queryFn` or `mutationFn`.
*   The hook typically extracts the `.data` property from the `SGSyncResponse` for convenience in `useQuery` or provides the full `SGSyncResponse` for mutations.

### 4. `<tag>/client.ts` (Per-Tag Orchestrator Module)
*   This file is **auto-generated and always overwritten on each run**. Do not edit it directly. Its basename is configurable via `generatedClientModuleBasename` (default: `client`).
*   **Purpose:** To provide ready-to-use API functions and hooks, instantiated with the chosen requester. These instantiated functions and hooks are **generic**, inheriting their generic parameters from the factories.
*   **Imports:**
    *   All factory functions from `./functions.ts`.
    *   All factory hooks (if generated) from `./hooks.ts`.
    *   The chosen requester:
        *   **If `useDefaultRequester: true`:**
            *   Imports `createDefaultSGSyncRequester` from `sg-schema-sync/default-requester`.
            *   Imports your `getToken` function from the module specified in `defaultRequesterConfig.getTokenModulePath` (using `defaultRequesterConfig.getTokenExportName`).
            *   Instantiates the default requester: `const requester = createDefaultSGSyncRequester({ baseURL, getToken });`
        *   **If `useDefaultRequester: false`:**
            *   Imports your custom requester **object** (conforming to `SGSyncRequester`) from the module specified in `customRequesterConfig.filePath` (using `customRequesterConfig.exportName`).
            *   `const requester = yourImportedCustomRequesterObject;`
*   **Instantiates Factories:** It calls all imported factory functions/hooks with the `requester` instance.
*   **Exports:** Exports the concrete, ready-to-use API functions (e.g., `export const GetUserById = createGetUserByIdFunction(requester);`) and hooks (e.g., `export const useGetUserById = createUseGetUserByIdHook(requester);`). These exported items are generic, allowing for type overrides.

### 5. `schema-sync-requester.ts` (Custom Requester File - User Owned)
*(Relevant only if `useDefaultRequester: false`. Default path: `<outputDir>/schema-sync-requester.ts`, configurable via `customRequesterConfig.filePath`)*
*   **Scaffolding:** If `scaffoldRequesterAdapter: true` (default) and this file does not already exist, a lean scaffold is generated. It will now provide an object structure.
    ```typescript
    // Example scaffold content (schema-sync-requester.ts)
    import type { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from 'sg-schema-sync/requester-types'; // Or your local path

    export const customSGSyncRequester: SGSyncRequester = {
      async request<TResponseData = any, TRequestBody = any, TQueryParams = any>(
        options: SGSyncRequesterOptions<TRequestBody, TQueryParams>
      ): Promise<SGSyncResponse<TResponseData>> {
        // TODO: Implement your HTTP request logic here.
        // This is a placeholder and will throw an error.
        const { method, url, data, params, headers, authRequire } = options;
        console.error(
          `[customSGSyncRequester.request] Not implemented for ${method} ${url}`,
          { data, params, headers, authRequire }
        );
        throw new Error('Custom SGSyncRequester not implemented.');

        // Example of what you might do (e.g., using fetch):
        /*
        let fullUrlString = url;
        if (params) {
          const query = new URLSearchParams();
          Object.keys(params).forEach(key => {
            const paramValue = (params as any)[key];
            if (paramValue !== undefined) {
              if (Array.isArray(paramValue)) {
                paramValue.forEach(v => query.append(key, String(v)));
              } else {
                query.append(key, String(paramValue));
              }
            }
          });
          const queryString = query.toString();
          if (queryString) {
            fullUrlString += `?${queryString}`;
          }
        }

        const effectiveHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(headers || {}),
        };

        if (authRequire) {
          // const token = await yourGetTokenFunction(); // Your token logic
          // if (token) {
          //   effectiveHeaders['Authorization'] = `Bearer ${token}`;
          // } else {
          //   console.warn(`[customSGSyncRequester.request] Auth required but no token for ${method} ${url}`);
          // }
          console.warn(`[customSGSyncRequester.request] Auth required, placeholder for token logic: ${method} ${url}`);
        }

        try {
          const response = await fetch(fullUrlString, {
            method: method.toUpperCase(),
            headers: effectiveHeaders,
            body: data ? JSON.stringify(data) : undefined,
          });

          let responseData: any;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            responseData = await response.json().catch(() => undefined);
          } else {
            responseData = await response.text();
          }

          const sgResponse: SGSyncResponse<TResponseData> = {
            data: responseData as TResponseData,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            config: options,
            originalResponse: response,
          };

          if (!response.ok) {
            return { ...sgResponse, isError: true };
          }
          return sgResponse;
        } catch (error: any) {
          console.error(`[customSGSyncRequester.request] Fetch error for ${method} ${url}:`, error);
          return {
            data: null as TResponseData,
            status: 0,
            statusText: error.message || 'Fetch error',
            headers: {},
            config: options,
            isError: true,
            originalResponse: error,
          };
        }
        */
      }
    };
    ```
    This file is **your responsibility** to complete by implementing the `request` method with your actual HTTP client logic (e.g., using `axios`, `fetch`, or your project's standard API service). It will **not be overwritten** by subsequent runs of `sg-schema-sync` once it exists.

### 6. Type Overriding with Generics

The functions generated in `<tag>/client.ts` (originating from factories in `functions.ts`) and the hooks (from `hooks.ts` via `client.ts`) are generic. This allows you to override the default types for responses and request bodies on a case-by-case basis directly at the call site.

**For API Functions:**
The generic signature typically looks like:
`async <TResponse = DefaultResponseType, TRequestBody = DefaultRequestBodyType, TQueryParams = DefaultQueryParamsType>(...)`

*   `TResponse`: Overrides the expected response data type.
*   `TRequestBody`: Overrides the request body data type.
*   `TQueryParams`: Overrides the query parameters type (less commonly overridden as these are usually well-defined by the schema).

**Example:**
```typescript
import { users } from './api/schema-sync'; // Assuming 'users' is a tag

interface MyCustomUserResponse {
  id: string;
  customFullName: string;
  emailAddress: string;
}

interface MyCustomCreateUserInput {
  firstName: string;
  lastName: string;
  emailAddress: string;
  age?: number;
}

async function fetchUsers() {
  // Default types
  const user = await users.getUserById({ userId: '123' });
  // user.data will be of type UsersTypes.GetUserById_Response (or similar)

  // Override response type
  const customUser = await users.getUserById<MyCustomUserResponse>({ userId: '456' });
  // customUser.data will be of type MyCustomUserResponse

  // Override request body and response type for a POST/PUT operation
  const createdUser = await users.createUser<MyCustomUserResponse, MyCustomCreateUserInput>({
    data: { firstName: 'Jane', lastName: 'Doe', emailAddress: 'jane@example.com' }
  });
  // createdUser.data will be MyCustomUserResponse
  // The 'data' payload must conform to MyCustomCreateUserInput
}
```

**For React Query Hooks:**
The generic signatures are similar, adapting to `useQuery` and `useMutation` patterns.

*   `useQuery`: `useQuery<TQueryData = DefaultQueryDataType, TError = Error, TQueryParams = DefaultQueryParamsType, ...>`
    *   `TQueryData`: Overrides the data type returned by the query.
*   `useMutation`: `useMutation<TData = DefaultDataType, TError = Error, TVariables = DefaultVariablesType, ...>`
    *   `TData`: Overrides the data type returned upon successful mutation.
    *   `TVariables`: Overrides the type of the variables passed to the mutation function (often the request body).

**Example:**
```typescript
import { useGetUserById, useCreateUser } from './api/schema-sync/users'; // Assuming direct import from client module

interface MyCustomUser {
  id: string;
  profileName: string;
}

interface MyMutationVariables {
  name: string;
  job: string;
}

function UserProfile({ userId }: { userId: string }) {
  // Default types
  const { data: defaultUser } = useGetUserById({ userId });
  // defaultUser is UsersTypes.GetUserById_Response

  // Override response type for useQuery
  const { data: customUser } = useGetUserById<MyCustomUser>({ userId });
  // customUser is MyCustomUser

  // Override response and variables types for useMutation
  const mutation = useCreateUser<MyCustomUser, MyMutationVariables>();

  const handleCreate = () => {
    mutation.mutate({ name: 'John Rider', job: 'Developer' });
    // mutation.data would be MyCustomUser upon success
  };
  // ...
}
```
Path parameters and query parameter structures themselves are generally not made generic at the call site, as they are directly derived from the OpenAPI path and parameter definitions. The `TQueryParams` generic for functions and hooks allows overriding the entire query parameters object type if needed, but individual parameter types within that object are still based on the schema.

Default types for `TResponse`, `TRequestBody`, `TQueryData`, `TVariables`, etc., are always derived from the types generated in `<tag>/types.ts` based on your OpenAPI schema.

## Example Usage Scenarios

### Scenario 1: Using the Default Requester
**(Set `useDefaultRequester: true` in `sg-schema-sync.config.js`)**

1.  **Configure:**
    In `sg-schema-sync.config.js`:
    ```javascript
    module.exports = {
      input: '...',
      outputDir: 'src/api/generated',
      baseURL: 'https://api.example.com/v1',
      useDefaultRequester: true,
      defaultRequesterConfig: {
        getTokenModulePath: '@/utils/auth', // Your module that exports getToken
        // getTokenExportName: 'getAuthToken', // If not named 'getToken'
      },
      // ... other options
    };
    ```
2.  **Implement `getToken`:**
    Ensure your `getToken` module (e.g., `src/utils/auth.ts`) correctly exports a function that returns `Promise<string | null>`:
```typescript
    // src/utils/auth.ts
    export const getToken = async (): Promise<string | null> => {
      // Your logic to retrieve the token, e.g., from localStorage, async storage, state manager
      return localStorage.getItem('authToken');
    };
    ```
3.  **Run `pnpm sg-schema-sync`**
4.  **Use in your application:**
    The generated `<tag>/client.ts` files will automatically use this setup.
```typescript
    // Assuming your outputDir is src/api/generated and you have a 'users' tag
    import { GetUserById, useGetUserById } from '@/api/generated/users'; 
    // Types are also re-exported:
    import type { GetUserByIdTypes_Response } from '@/api/generated/users';

    async function fetchUserData(id: string) {
      try {
        const response = await GetUserById({ pathParams: { userId: id } }); // Parameters are now objects
        if (response.status === 200) {
          const user: GetUserByIdTypes_Response = response.data; // Assuming this is the structure
          console.log('User:', user);
        } else {
          console.error('Failed to fetch user:', response.statusText, response.data);
        }
      } catch (error: any) { // error will be an SGSyncResponse if the requester caught and returned it as such, or rethrown error
        console.error('Error calling API', error);
        // if (error.isError && error.status === 401) { /* handle auth error */ }
      }
    }

    function UserProfile({ userId }: { userId: string }) {
      // Pass params as an object: { pathParams: { userId }, queryParams: { ... } }
      const { data: user, isLoading, error } = useGetUserById({ pathParams: { userId } }); 
  // ... render logic ...
}
```

### Scenario 2: Using a Custom Requester
**(Set `useDefaultRequester: false` in `sg-schema-sync.config.js`)**

1.  **Configure:**
    In `sg-schema-sync.config.js`:
    ```javascript
    module.exports = {
      input: '...',
      outputDir: 'src/api/generated',
      useDefaultRequester: false,
      customRequesterConfig: {
        filePath: 'schema-sync-requester.ts', // Relative to outputDir, so placed in src/api/generated/
        // Or an absolute path: '/abs/path/to/my-requester.ts'
        // Or a path deeper within outputDir: 'core/my-requester.ts'
        exportName: 'myAppRequester',
      },
      scaffoldRequesterAdapter: true, // Default, scaffolds if filePath doesn't exist
      // ... other options
    };
    ```
2.  **Implement Custom Requester:**
    *   Run `pnpm sg-schema-sync`. If `src/api/generated/schema-sync-requester.ts` (based on config above) doesn't exist, it will be scaffolded.
    *   Open the scaffolded (or manually created) `schema-sync-requester.ts` and implement your HTTP logic. Ensure it exports a function with the name specified in `customRequesterConfig.exportName` (`myAppRequester` in this example).
    ```typescript
    // src/api/generated/schema-sync-requester.ts (or your custom path)
    import type { SGSyncRequester, SGSyncRequesterOptions, SGSyncResponse } from 'sg-schema-sync/requester-types';
    import axios from 'axios'; // Or your preferred HTTP client

    export const myAppRequester: SGSyncRequester = async <TData = any>(
      options: SGSyncRequesterOptions
    ): Promise<SGSyncResponse<TData>> => {
      const { method, url, data, params, headers, authRequired, context } = options;
      
      const finalHeaders = { ...headers };
      if (authRequired) {
        // Example: Get token using a passed-in context function or a global store
        // const token = await someAuthService.getToken(); 
        // if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
        console.warn(`[${method} ${url}] Auth required, but token logic not fully implemented in this example custom requester.`);
      }

      try {
        const response = await axios.request({
          url,
          method,
          data,
          params,
          headers: finalHeaders,
          baseURL: context?.baseURL, // Assuming baseURL is passed in context if needed
        });
        return {
          data: response.data as TData,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          originalResponse: response,
        };
      } catch (err: any) {
        if (axios.isAxiosError(err) && err.response) {
          return {
            data: err.response.data as TData, // Or a specific error type
            status: err.response.status,
            statusText: err.response.statusText,
            headers: err.response.headers,
            originalResponse: err.response,
            isError: true,
          };
        }
        // Fallback for non-Axios errors or errors without a response
        // Option 1: Rethrow the error. The calling code (generated function) will catch it.
        // throw new Error(`Request failed: ${err.message || 'Unknown error'}`); 
        // Option 2: Return a generic error SGSyncResponse. This standardizes error handling.
        return {
            data: null as TData,
            status: (err.response?.status) || 0, // Use error status or a default
            statusText: (err.response?.statusText) || err.message || 'Unknown error',
            headers: (err.response?.headers) || {},
            isError: true,
            originalResponse: err.response, // Include original response if available
        };
      }
    };
    ```
3.  **Run `pnpm sg-schema-sync` again** (if you created/modified the requester after an initial run that didn't find it). The per-tag `client.ts` files will be re-generated to use your custom requester.
4.  **Use in your application:**
    Imports and usage look identical to Scenario 1, as the per-tag `client.ts` handles the wiring.
    ```typescript
    // Assuming your outputDir is src/api/generated and you have a 'users' tag
    import { GetUserById, useGetUserById } from '@/api/generated/users';
    // ... rest is similar to Scenario 1 ...
    ```

## Dependencies

*   `@tanstack/react-query`: (Required by **your project** if you set `generateHooks: true` in your config and use the generated hooks).
*   `axios`: (A dependency of `sg-schema-sync` itself for its default requester and spec fetching).

## Pitfalls & Known Issues
*   **OpenAPI Specification Quality:** The accuracy of generated code heavily depends on the input spec. Ensure `security` definitions are correct for `authRequired` to work as expected in the `SGSyncRequesterOptions`.
*   **Default Requester Auth:** You **must** correctly configure `defaultRequesterConfig.getTokenModulePath` and ensure your `getToken` function works for authentication with the default requester.
*   **Custom Requester Implementation:** When creating a custom requester, ensure thorough mapping between `SGSyncRequesterOptions`/`SGSyncResponse` and your project's own types/error handling. Pay attention to `authRequired` and how you handle token injection. The `context` property in `SGSyncRequesterOptions` can be used to pass additional utilities (like a `baseURL` or even your `getToken` if you prefer that pattern over the default requester's direct import).
*   **Naming Collisions:** While efforts are made to generate unique names, review generated files if your spec has highly ambiguous paths.
*   **Parameter Handling in Examples:** The `GetUserById({ pathParams: { userId: id } })` syntax in usage examples shows how parameters are now passed as structured objects. Ensure your actual calls match the generated function signatures.
*   **Content Types:** Primarily assumes `application/json`.
*   **React Query Version:** Assumes TanStack Query v4/v5 API compatibility for generated hooks.

---

*(This README will be updated as the tool evolves.)* 