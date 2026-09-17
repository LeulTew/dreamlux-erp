export const payrollPublicEnvironment = {
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:5326",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54335",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-dreamlux-browser-key-not-a-provider-credential",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-dreamlux-browser-key-not-a-provider-credential",
} as const;

export const payrollBrowserTestFiles = [
  "issue239-payroll-native.spec.ts",
  "issue233-payroll-preview-native.spec.ts",
] as const;

const SYSTEM_KEYS = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "COMSPEC",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
  "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA",
  "TEMP", "TMP", "TMPDIR", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR",
  "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY", "FONTCONFIG_PATH",
  "CI", "GITHUB_ACTIONS", "RUNNER_TRACKING_ID",
]);

export function payrollSystemEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && SYSTEM_KEYS.has(name.toUpperCase())) selected[name] = value;
  }
  return { ...selected, TZ: "UTC" };
}

export function payrollUiEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  return {
    ...payrollSystemEnvironment(source),
    ...payrollPublicEnvironment,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
  };
}
