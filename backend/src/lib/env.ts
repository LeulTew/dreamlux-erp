function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeRawValue(rawValue?: string): string {
  if (!rawValue) {
    return "";
  }

  return stripWrappingQuotes(rawValue).replace(/\\n/g, "\n");
}

export function getEnv(name: string, fallback = ""): string {
  if (name === "ADMIN_PASSWORD") {
    console.log("DEBUG GETENV ADMIN_PASSWORD:", {
      processEnvVal: process.env[name],
      fallback
    });
  }
  const normalized = normalizeRawValue(process.env[name]);
  if (!normalized) {
    return fallback;
  }

  const firstUsefulLine = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.toLowerCase() !== "n");

  return firstUsefulLine || fallback;
}

export function getEnvList(...names: string[]): string[] {
  const values = names
    .flatMap((name) => normalizeRawValue(process.env[name]).split(/\r?\n|,/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.toLowerCase() !== "n");

  return [...new Set(values)];
}