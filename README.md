# sg-schema-sync

A CLI tool to generate type-safe TypeScript API client code from an OpenAPI v3 specification.

This tool parses an OpenAPI JSON file (local or remote) and generates:
*   TypeScript interfaces corresponding to request bodies, parameters (query), and responses.
*   Axios-based functions for calling each API endpoint defined in the spec.
*   Optionally, TanStack Query (v4/v5) hooks (`useQuery`, `useMutation`) wrapping the Axios functions.

Files are organized into **tag-based directories**, where the tag is determined by the first `tag` associated with each endpoint in the OpenAPI specification.

## Installation

### From GitHub (Recommended for Development)

Install the tool as a development dependency directly from its GitHub repository using PNPM:

```bash
# Using SSH (if you have SSH keys configured with GitHub):
pnpm add -D git+ssh://git@github.com/diogo-SG/hackathon-2025.git#main

# Or using HTTPS:
pnpm add -D git+https://github.com/diogo-SG/hackathon-2025.git#main

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

*   `-i, --input <path_or_url>`: (Required) Path to a local OpenAPI JSON file or a URL pointing to one.
*   `-o, --output <directory>`: (Required) The base output directory where the tag-based generated folders will be placed (relative to the current working directory).
*   `--react-query`: (Optional) Generate TanStack Query hooks (`useQuery`/`useMutation`) in addition to the base Axios functions.

## Generated File Structure

The tool generates a directory for each API tag found in the specification. For a tag named `Users`, the structure would be:

```
<output_directory>/  
├── users/              # Folder for the 'Users' tag (name sanitized)
│   ├── index.ts        # Exports all types, functions, and hooks
│   ├── types.ts        # Generated TypeScript interfaces
│   ├── functions.ts    # Generated base Axios functions
│   └── hooks.ts        # Optional: Generated TanStack Query hooks
└── products/           # Folder for the 'Products' tag
    ├── index.ts
    ├── types.ts
    ├── functions.ts
    └── hooks.ts        # Optional
```

*   Tag names are sanitized for directory names (lowercase, spaces/slashes replaced with hyphens).
*   The `hooks.ts` file is only generated if the `--react-query` flag is used.
*   The `index.ts` file provides convenient barrel exports.

## Generated Code

Each tag directory contains the following files:

### `types.ts`

Contains TypeScript interfaces generated from the OpenAPI schemas for:
*   Request Bodies (Named like: `[BaseName]_[METHOD]_Request`, e.g., `User_POST_Request`)
*   Successful Responses (Named like: `[BaseName]_[METHOD]_Response`, e.g., `UserById_GET_Response`)
*   Query Parameters (Named like: `[BaseName]_[METHOD]_Parameters`, e.g., `Users_GET_Parameters`)

*   `[BaseName]` is derived preferably from the `operationId` (PascalCase), falling back to a PascalCase version of the path with parameters converted (e.g., `/users/{id}` -> `UsersById`).
*   `[METHOD]` is the uppercase HTTP method (GET, POST, etc.).
*   *Note: If type generation fails due to issues in the OpenAPI spec (like broken `$ref`s), a warning comment will be added to the file instead of the type.*

### `functions.ts`

Contains async functions for each API operation associated with the tag.

*   **Naming:** Function names follow the pattern `[PascalCaseEndpoint]_[METHOD_UPPERCASE]` (e.g., `UsersById_GET`, `Users_POST`). `[PascalCaseEndpoint]` is derived from the path structure (e.g., `/users/{id}` -> `UsersById`).
*   **Parameters:** Functions include parameters for:
    *   Path variables (currently typed as `string`).
    *   Request body (`data:` parameter, typed using the corresponding `..._Request` type from `types.ts`).
    *   Query parameters (`params?:` parameter, typed using the corresponding `..._Parameters` type from `types.ts`).
    *   An optional final `config?: AxiosRequestConfig` parameter.
*   **Return Type:** Functions return `Promise<AxiosResponse<T>>`, where `T` is the corresponding `..._Response` type from `types.ts` (or `any`/`void` if generation failed/not applicable).
*   **Error Handling:** Warning comments are prepended if related type generation failed.

### `hooks.ts`

*(Generated only if `--react-query` flag is used)*

Contains TanStack Query (React Query) hooks wrapping the base Axios functions:

*   **`useQuery` Hooks (for GET requests):**
    *   Named like `use[FunctionName]` (e.g., `useUsersById_GET`).
    *   Accepts path parameters, an optional `params` object, and optional `UseQueryOptions`.
    *   Constructs a query key.
    *   Calls the corresponding function from `functions.ts`.
*   **`useMutation` Hooks (for POST, PUT, PATCH, DELETE requests):**
    *   Named like `use[FunctionName]` (e.g., `useUsers_POST`).
    *   Accepts optional `UseMutationOptions`.
    *   Expects a `variables` object passed to `mutate`/`mutateAsync` containing path parameters, `data`, and/or `params` as needed by the corresponding function in `functions.ts`.
    *   Calls the corresponding function from `functions.ts`.

### `index.ts`

Provides barrel exports for convenience:
```typescript
export * from './types';
export * from './functions';
// export * from './hooks'; // Conditionally exported
```

## Example Usage

```typescript
// Import via the index file
import { UsersById_GET, useUsersById_GET } from '@/api/generated/users'; 
import type { UsersById_GET_Response } from '@/api/generated/users';
import type { AxiosResponse } from 'axios';

// Using the base function
async function fetchUser(userId: string) {
  try {
    const response: AxiosResponse<UsersById_GET_Response> = await UsersById_GET(userId);
    console.log('User:', response.data);
  } catch (error) {
    console.error('Failed to fetch user:', error);
  }
}

// Using the TanStack Query hook
function UserComponent({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUsersById_GET(userId, undefined, {
    staleTime: 5 * 60 * 1000,
  });
  // ... render logic ...
}
```

## Dependencies (when using `--react-query`)

If you use the `--react-query` flag, your project **must** have `@tanstack/react-query` installed:

```bash
pnpm add @tanstack/react-query
# or yarn add / npm install
```

## Pitfalls & Known Issues

*   **OpenAPI Specification Quality:** Accuracy depends heavily on the input spec.
    *   **Broken `$ref`s:** Dereferencing is attempted. If it fails, generation proceeds with the original spec, potentially leading to type generation failures (indicated by comments and `any` types).
    *   **Invalid Schemas:** Complex or invalid schemas may cause type generation to fail.
*   **Naming Collisions:** While efforts are made to generate unique names based on paths and methods, extremely similar paths might still rarely lead to collisions. Review generated files if your spec has highly ambiguous paths.
*   **Parameter Handling:** Only basic query parameter handling is implemented.
*   **Content Types:** Assumes `application/json`.
*   **Authentication:** Pass auth details via the `config` parameter.
*   **React Query Version:** Assumes TanStack Query v4/v5 API compatibility.

---

*(This README will be updated as the tool evolves.)* 