# API Client Generator

A CLI tool to generate type-safe TypeScript API client code from an OpenAPI v3 specification.

## Installation

Install the tool as a development dependency in your project:

```bash
pnpm add -D api-client-generator # Replace with Git URL or NPM package name once published
```

## Usage

Run the generator using `pnpm`:

```bash
pnpm generate-api-client -i <path_or_url_to_openapi.json> -o <output_path/client.ts>
```

**Options:**

*   `-i, --input <path_or_url>`: (Required) Path or URL to the OpenAPI JSON specification.
*   `-o, --output <path>`: (Required) Output path for the generated TypeScript file (relative to the current working directory).

---

*(More details will be added later)* 