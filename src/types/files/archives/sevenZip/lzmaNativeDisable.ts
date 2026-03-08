// Disable xz-compat's runtime package installation before 7z-iterator loads it.
// This must be a separate module imported ahead of '7z-iterator' because ESM imports
// are hoisted and evaluated before any inline statements in the importing file.
process.env.LZMA_NATIVE_DISABLE = '1';
