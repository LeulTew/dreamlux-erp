const CONNECTION_OVERRIDE_KEYS = new Set([
  "host", "hostaddr", "port", "user", "password", "database", "dbname",
  "service", "servicefile", "passfile", "sslpassword",
]);

export function hasPostgresConnectionOverride(url: URL): boolean {
  return [...url.searchParams.keys()].some((name) => CONNECTION_OVERRIDE_KEYS.has(name.toLowerCase()));
}
