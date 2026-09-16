import backend from "../../backend/eslint.config.mjs";

export default [
  ...backend,
  {
    files: ["scripts/payroll/**/*.ts", "frontend/*payroll*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["scripts/payroll/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { process: "readonly", require: "readonly", module: "readonly", URL: "readonly", Request: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
