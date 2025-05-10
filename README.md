# SGSchema-Sync

A CLI tool to generate type-safe TypeScript API client code from an OpenAPI v3 specification.

This tool parses an OpenAPI JSON file (local or remote) and generates:
*   TypeScript interfaces for request bodies, parameters, and responses.
*   **Factory functions** for creating API call functions.
*   Optionally, **factory functions** for TanStack Query (v4/v5) hooks.
*   An optional, auto-generated **default client file** that uses a built-in requester for immediate use.

Files are organized into **tag-based directories**, where the tag is determined by the first `tag` associated with each endpoint in the OpenAPI specification.

## Key Features & Approach

SGSchema-Sync now employs a **factory-based approach** for generating API functions and hooks. This provides flexibility for integration into various project structures:

1.  **Core Generation (Factories):**
    *   `functions.ts`: Contains factory functions (e.g., `createGetProductFunction(requester)`) for each API operation. These factories take an `SGSyncRequester` instance (see below) and return an actual async function to call the API.
    *   `hooks.ts`: (If `--react-query` is enabled) Contains factory functions (e.g., `createUseGetProductHook(requester)`) for TanStack Query hooks. These also take an `SGSyncRequester`.
    *   `types.ts`: Contains all TypeScript request/response types.

2.  **Requester Abstraction (`SGSyncRequester`):**
    *   The generated factories depend on a `SGSyncRequester` function type. This function is responsible for making the actual HTTP request.
    *   Your project can provide its own implementation of this requester, adapting to your existing API service layer or preferred HTTP client.
    *   The `SGSyncRequester`, `SGSyncRequesterOptions`, and `SGSyncResponse` types are importable from the `sg-schema-sync` package (once published and installed) or will be available alongside generated code for local use.

3.  **Default Client (Optional Quick Start):**
    *   If configured (`useDefaultRequester: true` in `sg-schema-sync.config.js`), the tool generates an additional file per tag (e.g., `products.sgClient.ts`).
    *   This file uses a **built-in default requester** (based on Axios/Fetch) provided by `sg-schema-sync`.
    *   It automatically instantiates all function and hook factories, exporting ready-to-use API functions and hooks.
    *   This is ideal for new projects or for quickly getting started.

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
pnpm sg-schema-sync -i <path_or_url_to_openapi.json> -o ./src/api/generated
```

**Options:**

*   `-i, --input <path_or_url>`: (Required) Path to a local OpenAPI JSON file or a URL pointing to one (this can serve as a fallback or override for `baseURL` if not specified in the config file).
*   `-o, --output <directory>`: (Required) The base output directory where the tag-based generated folders will be placed (relative to the current working directory).
*   `--react-query`: (Optional) Generate TanStack Query hooks (`useQuery`/`useMutation`) in addition to the base Axios functions.
*   `--config <path>`: (Optional) Path to a JavaScript configuration file (e.g., `sg-schema-sync.config.js`). If not provided, the tool will automatically look for `sg-schema-sync.config.js` in the current working directory. This file can export configuration options to customize fetching the OpenAPI spec and other aspects of generation.
*   `--prettier / --no-prettier`: (Optional) Enable or disable Prettier formatting for the generated files. Defaults to enabled. This overrides the `formatWithPrettier` setting in the config file.
*   `--prettier-config-path <path>`: (Optional) Path to a custom Prettier configuration file (e.g., `.prettierrc.json`, `prettier.config.js`). If provided, this overrides the `prettierConfigPath` setting in the config file and Prettier's default config discovery.

## Configuration File (`sg-schema-sync.config.js`)

Provide advanced options via a JavaScript file (default: `sg-schema-sync.config.js` in your project root, or specify with `--config`).
It should export a `config` object: `module.exports = { config: { /* ... */ } };`

**`config.packageConfig` options:**

*   `baseURL: string`: Base URL for the API (used by the default requester or if `--input` is not a full URL).
*   `generateFunctionNames: string`: Template for generated function names (e.g., `{method}{Endpoint}`). Default: `{method}{Endpoint}`.
*   `generateTypesNames: string`: Template for generated type names. Default: `{Method}{Endpoint}Types`.
*   `generateHooksNames: string`: Template for generated hook names. Default: `use{Method}{Endpoint}`.
*   `useDefaultRequester: boolean`: (Default: `false`)
    *   If `true`, a client file (e.g., `[tagName].sgClient.ts`) is generated for each tag, using a built-in default requester. This provides ready-to-use functions and hooks.
    *   If `false`, only factory functions are generated, and you provide your own requester implementation.
*   `defaultClientFileSuffix: string`: (Default: `'sgClient.ts'`) Suffix for the auto-generated client file when `useDefaultRequester` is true. Example: `products.sgClient.ts`.
*   `formatWithPrettier: boolean`: (Default: `true`) Whether to format the generated output files using Prettier. Can be overridden by the `--prettier` / `--no-prettier` CLI flags.
*   `prettierConfigPath: string | undefined`: (Default: `undefined`) Path to a custom Prettier configuration file. If not set, Prettier will attempt to find a configuration file as per its standard discovery mechanism (e.g., `.prettierrc` in the project). Can be overridden by the `--prettier-config-path` CLI flag.
*   *(Other fields like `generateFunctions`, `generateHooks`, `baseDir` also exist).*

**Example `sg-schema-sync.config.js`:**
```javascript
// sg-schema-sync.config.js
module.exports = {
  config: {
    packageConfig: {
      baseURL: 'https://api.example.com/v1',
      useDefaultRequester: true, // Generate a client file with default requester
      defaultClientFileSuffix: 'Client.ts', // e.g., usersClient.ts
      formatWithPrettier: true, // Explicitly set, though true is the default
      // prettierConfigPath: '.prettierrc.custom.json', // Optional: specify custom prettier config

      // Optional: Override default naming conventions
      // generateFunctionNames: "call{Endpoint}{method}",
      // generateTypesNames: "{Method}{Endpoint}Schema",
      // generateHooksNames: "fetch{Endpoint}{Method}Hook",
    },
    requestConfig: { // Passed to the spec fetching request, not the generated client by default
      timeout: 10000,
      headers: { 'X-API-KEY': 'your-key-for-spec-fetching' },
    },
  }
};
```

**Configuration Precedence:** (Simplified)
1.  CLI arguments (e.g., `-o`, `--react-query`, `--prettier`, `--prettier-config-path`).
2.  `sg-schema-sync.config.js` values.
3.  `--input` (as fallback for `baseURL`).
4.  Internal defaults.

## Generated File Structure

By default, after generation, all `.ts` and `.js` files in the output directory will be formatted using Prettier. This behavior can be controlled via configuration (see above).

For a tag named `Users`:
```
<output_directory>/
├── users/
│   ├── index.ts        # Main barrel export for the tag
│   ├── types.ts        # TypeScript interfaces
│   ├── functions.ts    # Exports *factory functions* for API calls
│   ├── hooks.ts        # Optional: Exports *factory functions* for TanStack Query hooks
│   └── users.sgClient.ts # Optional: Generated if useDefaultRequester=true
└── # ... other tags
```

## Generated Code Deep Dive

### 1. `types.ts`
Contains TypeScript interfaces for request bodies, parameters, and responses. (Naming: `{Method}{Endpoint}Types_Request`, `{Method}{Endpoint}Types_Response`, etc.)

### 2. `functions.ts` (Core Factories)
*   Exports **factory functions** for each API operation, e.g., `export const createGetUserByIdFunction = (requester: SGSyncRequester) => { /* returns async func */ };`
*   Each factory takes an `SGSyncRequester` argument.
*   The returned async function (e.g., `getUserById`) takes path parameters, data, params, and `callSpecificOptions`. It constructs `SGSyncRequesterOptions` (including `authRequire: boolean` derived from your OpenAPI spec's `security` definitions) and calls the provided `requester`.
*   The returned function's promise resolves with an `SGSyncResponse<ResponseType>`.
*   **`SGSyncRequester`, `SGSyncRequesterOptions`, `SGSyncResponse`**: These crucial types define the contract for the requester mechanism. They are exported by the `sg-schema-sync` package (or available locally) for you to implement a custom requester.

### 3. `hooks.ts` (React Query Factories)
*(Generated only if `--react-query` is used)*
*   Exports **factory functions** for TanStack Query hooks, e.g., `export const createUseGetUserByIdHook = (requester: SGSyncRequester) => { /* returns hook */ };`
*   Each factory takes an `SGSyncRequester`.
*   The returned hook internally uses the corresponding function factory (e.g., `createGetUserByIdFunction`) to get an API call function, then uses it in `queryFn` or `mutationFn`.
*   The hook extracts the `.data` property from the `SGSyncResponse`.

### 4. `[tagName][defaultClientFileSuffix].ts` (e.g., `users.sgClient.ts`)
*(Generated only if `useDefaultRequester: true` in config)*
*   This file provides a **ready-to-use client**.
*   It imports `createDefaultSGSyncRequester` from `sg-schema-sync` (this is a basic Axios/Fetch-based requester).
*   It imports all factory functions from `./functions.ts` and (if applicable) `./hooks.ts`.
*   It instantiates the default requester, configured with `baseURL` from your `packageConfig`.
*   **Crucially, it includes a placeholder `getToken()` function.** You **must** edit this function in the generated file to provide your application's actual authentication token if your APIs require auth.
    ```typescript
    // Example snippet from the generated users.sgClient.ts
    const getToken = async (): Promise<string | null> => {
      // TODO: Implement your token retrieval logic here.
      // Example: return localStorage.getItem('authToken');
      console.warn('[SGSchema-Sync Client] getToken() needs to be implemented...');
      return null;
    };
    const configuredRequester = createDefaultSGSyncRequester({ baseURL, getToken });
    ```
*   It then calls all imported factories with `configuredRequester` and exports the concrete, ready-to-use API functions (e.g., `export const GetUserById = ...;`) and hooks (e.g., `export const useGetUserById = ...;`).

### 5. `index.ts` (Barrel Exports)
*   Always exports `* from './types';`.
*   If `useDefaultRequester: true`: Exports `* from './[tagName][defaultClientFileSuffix]';` (e.g., `* from './users.sgClient';`).
*   If `useDefaultRequester: false`: Exports `* from './functions';` and `* from './hooks';` (if generated), allowing you to import and use the factories with your custom requester.

## Example Usage Scenarios

### Scenario 1: Quick Start with Default Client
**(Set `useDefaultRequester: true` in `sg-schema-sync.config.js`)**

1.  **Run `pnpm sg-schema-sync ...`**
    This generates `users.sgClient.ts` (or your custom suffix).
2.  **Implement `getToken()`:**
    Open the generated `users.sgClient.ts` file and implement the `getToken` function to retrieve your app's authentication token.
3.  **Use in your application:**
    ```typescript
    // Assuming your output directory is src/api/generated
    import { GetUserById, useGetUserById } from '@/api/generated/users'; 
    // Types are also re-exported via the client file or directly from types.ts
    import type { UserResponse } from '@/api/generated/users/types'; // Or from '@/api/generated/users';

    async function fetchUserData(id: string) {
      try {
        // GetUserById now returns SGSyncResponse<UserResponse>
        const response = await GetUserById(id); 
        if (response.status === 200) {
          const user: UserResponse = response.data;
          console.log('User:', user);
        } else {
          console.error('Failed to fetch user:', response.statusText);
        }
      } catch (error) {
        console.error('Error calling API', error);
      }
    }

    function UserProfile({ userId }: { userId: string }) {
      const { data: user, isLoading, error } = useGetUserById(userId);
      // ... render logic ...
    }
    ```

### Scenario 2: Advanced Integration with Custom Requester
**(Set `useDefaultRequester: false` in `sg-schema-sync.config.js`)**

1.  **Run `pnpm sg-schema-sync ...`**
    This generates `functions.ts` and `hooks.ts` containing factories.
2.  **Create your Requester Adapter:**
    In your project (e.g., `src/api/sgClientSetup.ts`), implement an adapter that conforms to the `SGSyncRequester` signature. This adapter will call your project's existing API request function.

    ```typescript
    // src/api/sgClientSetup.ts
    import { 
      SGSyncRequester, 
      SGSyncRequesterOptions, 
      SGSyncResponse 
    } from 'sg-schema-sync'; // Import types from the package

    // Import your project's existing API call function and its types
    import YOUR_PROJECT_REQUEST_FUNCTION from '@/services/apiService'; // Example
    import type { YourRequestOptions, YourResponse } from '@/services/apiService'; // Example

    // Import generated factories for a specific tag (e.g., users)
    import * as userFunctionFactories from './generated/users/functions';
    import * as userHookFactories from './generated/users/hooks'; // If using hooks

    const myCustomRequester: SGSyncRequester = async <T = any>(
      sgOptions: SGSyncRequesterOptions
    ): Promise<SGSyncResponse<T>> => {
      // 1. Map SGSyncRequesterOptions to your project's request options
      const projectOptions: YourRequestOptions = {
        method: sgOptions.method,
        endpoint: sgOptions.url, // Your function might take 'endpoint' instead of 'url'
        body: sgOptions.data,
        queryParams: sgOptions.params,
        requiresAuth: sgOptions.authRequire,
        customHeaders: sgOptions.headers,
        // ... map other necessary fields ...
      };

      // 2. Call your project's request function
      const projectResponse: YourResponse<T> = await YOUR_PROJECT_REQUEST_FUNCTION(projectOptions);

      // 3. Map your project's response back to SGSyncResponse<T>
      return {
        data: projectResponse.payload, // Example mapping
        status: projectResponse.statusCode,
        statusText: projectResponse.message || '',
        headers: projectResponse.responseHeaders || {},
        config: sgOptions, // Pass original sgOptions back
      };
    };

    // Instantiate and export functions for the 'users' tag
    export const GetUserById = userFunctionFactories.createGetUserByIdFunction(myCustomRequester);
    export const CreateUser = userFunctionFactories.createCreateUserFunction(myCustomRequester);
    // ... and so on

    // Instantiate and export hooks for the 'users' tag (if using React Query)
    export const useUserById = userHookFactories.createUseGetUserByIdHook(myCustomRequester);
    export const useCreateUser = userHookFactories.createUseCreateUserHook(myCustomRequester);
    // ... and so on
    ```
3.  **Use in your application:**
    ```typescript
    import { GetUserById, useUserById } from '@/api/sgClientSetup'; // Import from your setup file
    // ... rest is similar to Scenario 1, but uses your custom requester's behavior ...
    ```

## Dependencies

*   `@tanstack/react-query`: (Required by **your project** if you enable `--react-query` and use the generated hooks).
*   `axios`: (A dependency of `sg-schema-sync` itself for its default requester and spec fetching).

## Pitfalls & Known Issues
*   **OpenAPI Specification Quality:** The accuracy of generated code heavily depends on the input spec. Ensure `security` definitions are correct for `authRequire` to work as expected.
*   **Default Requester Auth:** The `getToken()` in the auto-generated client file is a placeholder and **must** be implemented for authentication to work with the default requester.
*   **Custom Requester Mapping:** When creating a custom requester adapter, ensure thorough mapping between `SGSyncRequesterOptions`/`SGSyncResponse` and your project's own types.
*   **Naming Collisions:** While efforts are made to generate unique names based on paths and methods, extremely similar paths might still rarely lead to collisions. Review generated files if your spec has highly ambiguous paths.
*   **Parameter Handling:** Only basic query parameter handling is implemented.
*   **Content Types:** Assumes `application/json`.
*   **Authentication:** Pass auth details via the `config` parameter.
*   **React Query Version:** Assumes TanStack Query v4/v5 API compatibility.

---

*(This README will be updated as the tool evolves.)* 