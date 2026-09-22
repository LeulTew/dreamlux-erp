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

type AuthSecretName = "JWT_SECRET" | "ADMIN_PASSWORD" | "MANAGER_PASSWORD";

export class AuthConfigurationError extends Error {
  constructor(setting: AuthSecretName, reason: "missing" | "invalid format" | "insufficient strength") {
    super(`${setting}: ${reason}`);
    this.name = "AuthConfigurationError";
  }
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
  });
}

function requireAuthSecret(setting: AuthSecretName, minimumBytes: number): string {
  const raw = process.env[setting];
  const value = normalizeRawValue(raw);
  if (!value) throw new AuthConfigurationError(setting, "missing");
  if (hasControlCharacters(raw || "") || hasControlCharacters(value)) {
    throw new AuthConfigurationError(setting, "invalid format");
  }

  const words = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const placeholder = /(?:^|-)(?:change-?me|replace-(?:me|this|with)|your-(?:[a-z0-9]+-)*(?:secret|password|key)|placeholder|example|dummy|default)(?:-|$)/;
  if (Buffer.byteLength(value, "utf8") < minimumBytes
    || /^(.{1,8})\1+$/u.test(value)
    || placeholder.test(words)) {
    throw new AuthConfigurationError(setting, "insufficient strength");
  }
  return value;
}

export function getAuthSigningSecret(): string {
  return requireAuthSecret("JWT_SECRET", 32);
}

export function getAdminRecoveryPassword(): string | null {
  if (process.env.ADMIN_PASSWORD === undefined) return null;
  return requireAuthSecret("ADMIN_PASSWORD", 16);
}

export function getProvisioningPasswords(): { adminPassword: string; managerPassword: string } {
  return {
    adminPassword: requireAuthSecret("ADMIN_PASSWORD", 16),
    managerPassword: requireAuthSecret("MANAGER_PASSWORD", 16),
  };
}
