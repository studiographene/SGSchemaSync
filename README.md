# API Client Generator

A CLI tool to generate type-safe TypeScript API client code from an OpenAPI v3 specification.

This tool parses an OpenAPI JSON file (local or remote) and generates:
*   TypeScript interfaces corresponding to request bodies, parameters (query), and responses.
*   Axios-based functions for calling each API endpoint defined in the spec.
*   Optionally, TanStack Query (v4/v5) hooks (`useQuery`, `useMutation`) wrapping the Axios functions.

Files are organized by the first `tag` associated with each endpoint in the OpenAPI specification.

## Installation

Install the tool as a development dependency in your project using PNPM:

```bash
# Replace with the actual Git URL or NPM package name once published
pnpm add -D git@github.com:diogo-SG/hackathon-2025.git 
# or if published to NPM:
# pnpm add -D api-client-generator 
```

## Usage

Run the generator from the root of your project using the command exposed via `pnpm`:

```bash
# Example:
pnpm generate-api-client -i <path_or_url_to_openapi.json> -o ./src/api/generated
```

**Options:**

*   `-i, --input <path_or_url>`: (Required) Path to a local OpenAPI JSON file or a URL pointing to one.
*   `-o, --output <directory>`: (Required) The base output directory where the generated files will be placed (relative to the current working directory). The tool will create `types`, `functions`, and optionally `query-hooks` subdirectories within this path.
*   `--react-query`: (Optional) Generate TanStack Query hooks (`useQuery`/`useMutation`) in addition to the base Axios functions.

## Generated File Structure

With `--react-query` enabled:

```
<output_directory>/  
├── types/            
│   ├── users.ts        
│   └── ...           
├── functions/        
│   ├── users.ts        
│   └── ...           
└── query-hooks/      # Optional: Contains TanStack Query hooks
    ├── users.ts        
    └── ...           
```

Without `--react-query`, the `query-hooks` directory is not created.

*Tag names are sanitized for filenames (lowercase, spaces/slashes replaced with hyphens).* 

## Generated Code

### Types (`<output_directory>/types/<tag>.ts`)

Contains TypeScript interfaces generated from the OpenAPI schemas for:
*   Request Bodies (e.g., `CreateUserRequestBody`)
*   Successful Responses (e.g., `GetUserResponse`, `ListUsersResponse200`)
*   Query Parameters (e.g., `ListUsersParameters`)

*Note: If type generation fails due to issues in the OpenAPI spec (like broken `$ref`s), a warning comment will be added to the file instead of the type.* 

### Functions (`<output_directory>/functions/<tag>.ts`)

Contains async functions for each API operation associated with the tag.

*   **Naming:** Function names are derived from the `operationId` in the spec, falling back to a name generated from the HTTP method and path.
*   **Parameters:** Functions include parameters for:
    *   Path variables (currently typed as `string`).
    *   Request body (`data:` parameter, typed using the generated RequestBody interface).
    *   Query parameters (`params?:` parameter, typed using the generated Parameters interface).
    *   An optional final `config?: AxiosRequestConfig` parameter to allow overriding Axios settings (e.g., adding headers, authentication tokens).
*   **Return Type:** Functions return `Promise<AxiosResponse<T>>`, where `T` is the generated interface for the primary success response (e.g., 200 for GET, 201 for POST) or `void` for responses like 204 No Content.
*   **Error Handling:** If type generation failed for request body, parameters, or response, the function signature will use `any` as a fallback, and a warning comment will be prepended to the function definition.

**Example Usage of Generated Code:**

```typescript
import { GetUserById } from './api/generated/functions/users';
import type { GetUserByIdResponse } from './api/generated/types/users';
import type { AxiosResponse } from 'axios';

async function fetchUser(userId: string) {
  try {
    const response: AxiosResponse<GetUserByIdResponse> = await GetUserById(userId, {
      // Example: Add authentication header via Axios config
      headers: {
        Authorization: `Bearer YOUR_TOKEN`
      }
    });
    
    if (response.status === 200) {
      console.log('User:', response.data); // response.data is typed as GetUserByIdResponse
    } 
  } catch (error) {
    // Handle API call errors (network, non-2xx status codes)
    console.error('Failed to fetch user:', error);
  }
}
```

### Query Hooks (`<output_directory>/query-hooks/<tag>.ts`)

*(Generated only if `--react-query` flag is used)*

Contains TanStack Query (React Query) hooks wrapping the base Axios functions:

*   **`useQuery` Hooks (for GET requests):**
    *   Named like `use[FunctionName]` (e.g., `useUsersById_GET`).
    *   Accept path parameters, an optional `params` object (if query parameters exist), and optional `UseQueryOptions`.
    *   Automatically constructs a query key based on the tag, endpoint, path parameters, and query parameters.
    *   The `queryFn` calls the base Axios function and returns `response.data`.
*   **`useMutation` Hooks (for POST, PUT, PATCH, DELETE requests):**
    *   Named like `use[FunctionName]` (e.g., `useUsers_POST`).
    *   Accept optional `UseMutationOptions`.
    *   The variables passed to the hook\'s `mutate` function should be an object containing required path parameters, the `data` payload (if applicable), and `params` (if applicable).
    *   The `mutationFn` calls the base Axios function with the provided variables and returns `response.data`.

**Dependencies:** If you use the `--react-query` flag, your project **must** have `@tanstack/react-query` installed:

```bash
pnpm add @tanstack/react-query
# or
yarn add @tanstack/react-query
# or
npm install @tanstack/react-query
```

**Example Usage of Generated Hooks:**

```typescript
import { useUsersById_GET } from \'./api/generated/query-hooks/users\';
import { useUsers_POST } from \'./api/generated/query-hooks/users\';
import type { Users_POST_Request } from \'./api/generated/types/users\';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUsersById_GET(userId, undefined, { // No query params
    // React Query options, e.g., staleTime
    staleTime: 5 * 60 * 1000, 
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading user: {error.message}</div>;

  return <div>User Name: {user?.name}</div>; // data is typed!
}

function CreateUserForm() {
  const createUserMutation = useUsers_POST({
    onSuccess: (newUser) => {
      console.log(\'User created!\', newUser); // newUser is typed
      // Invalidate user list query, etc.
    },
    onError: (error) => {
       console.error(\'Failed to create user:\', error.message);
    }
  });

  const handleSubmit = (formData: Users_POST_Request) => {
    createUserMutation.mutate({ data: formData }); // Pass variables object
  };

  // ... render form ...
}
```

## Pitfalls & Known Issues

*   **OpenAPI Specification Quality:** The quality of the generated code heavily depends on the correctness and completeness of the input OpenAPI specification.
    *   **Broken `$ref`s:** The tool attempts to dereference `$ref` pointers. If this fails (e.g., the reference target doesn't exist in `components`), the tool will issue a warning and proceed using the original spec. Subsequent type generation relying on that `$ref` will likely fail, resulting in warning comments in the type file and `any` types in function signatures.
    *   **Invalid Schemas:** If a schema is invalid or too complex for `json-schema-to-typescript` to parse, type generation for it will fail, resulting in warnings and fallbacks to `any`.
*   **Parameter Handling:** Currently, only basic query parameter handling is implemented. Header, cookie, and complex path parameter serialization might not be fully supported.
*   **Content Types:** Assumes `application/json` for request and response bodies. Other content types are not explicitly handled.
*   **Authentication:** The tool does not automatically handle authentication methods defined in the spec. You need to pass necessary headers or configurations via the `config` parameter of the generated functions.
*   **React Query Version:** Assumes TanStack Query v4 or v5 API compatibility.

---

*(This README will be updated as the tool evolves.)* 