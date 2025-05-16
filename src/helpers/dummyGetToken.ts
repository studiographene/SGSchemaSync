// src/helpers/dummyGetToken.ts
// Placeholder for testing default requester config.
// This function doesn't need to do anything real for generation tests.
export const getToken = async (): Promise<string | null> => {
  console.log(
    "Dummy getToken called - this should only happen if generated client is executed, not during generation test."
  );
  return "dummy-auth-token-for-testing";
};
