import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "node:fs", message: "core/ must be pure — filesystem access belongs in io/." },
          { name: "node:path", message: "core/ must be pure — path handling belongs in io/." },
          { name: "fs", message: "core/ must be pure." },
          { name: "path", message: "core/ must be pure — path handling belongs in io/." },
        ],
      }],
      "no-console": "error",
    },
  },
);
