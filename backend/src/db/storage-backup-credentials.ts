// This rejects read-filtered client credentials; the provider still authenticates every request.
export function assertStorageServiceCredential(key: string, expectedProjectRef?: string): void {
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    let claims: unknown;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); }
    catch { throw new Error("Storage backup requires a server secret or service_role credential"); }
    if (claims && typeof claims === "object" && "role" in claims && claims.role === "service_role"
      && (!expectedProjectRef || !("ref" in claims) || claims.ref === expectedProjectRef)) return;
  }
  throw new Error("Storage backup requires a server secret or matching service_role credential");
}
