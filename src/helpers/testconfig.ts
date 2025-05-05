import { PackageConfig } from "../config";

export const clientConfig: Partial<PackageConfig> = {
  baseURL: "https://dev.surveyapi.59club.studiographene.xyz/api/api-docs.json",
  generateFunctionNames: "custom{method}{Endpoint}",
  generateTypesNames: "test{Method}{Endpoint}Types",
  generateHooksNames: "use{Method}{Endpoint}Mock",
  baseDir: "test-output/api/config-test",
};