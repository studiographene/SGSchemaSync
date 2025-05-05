#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { runGenerator, GeneratorOptions } from "./index"; // Import core logic
import packageJson from "../package.json"; // Import for version

const program = new Command();

program
  .name("generate-api-client")
  .description("Generates type-safe client code from an API specification")
  .version(packageJson.version); // Use version from package.json

program
  .requiredOption("-i, --input <path_or_url>", "Path or URL to the OpenAPI JSON specification")
  .requiredOption("-o, --output <path>", "Output path for the generated TypeScript file (relative to CWD)");

program.parse(process.argv);

const options = program.opts<GeneratorOptions>();

runGenerator(options).catch((error) => {
  // console.error handled in runGenerator
  process.exit(1); // Exit with error code if runGenerator fails
});
