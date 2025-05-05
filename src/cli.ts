#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { runGenerator, GeneratorOptions as CoreGeneratorOptions } from "./index"; // Import core logic
import packageJson from "../package.json"; // Import for version

// Extend CoreGeneratorOptions for CLI specific flags
interface CliGeneratorOptions extends CoreGeneratorOptions {
  reactQuery?: boolean;
}

const program = new Command();

program
  .name("sg-schema-sync")
  .description(
    "CLI tool to generate type-safe API clients (Axios functions, types, optional TanStack Query hooks) from an OpenAPI v3 specification."
  )
  .version(packageJson.version); // Use version from package.json

program
  .requiredOption("-i, --input <path_or_url>", "Path or URL to the OpenAPI JSON specification")
  .requiredOption("-o, --output <path>", "Output path for the generated TypeScript file (relative to CWD)")
  // Add the react-query flag
  .option("--react-query", "Generate TanStack Query (v4/v5) hooks");

program.parse(process.argv);

// Use the extended options type here
const options = program.opts<CliGeneratorOptions>();

runGenerator(options).catch((error) => {
  // console.error handled in runGenerator
  process.exit(1); // Exit with error code if runGenerator fails
});
