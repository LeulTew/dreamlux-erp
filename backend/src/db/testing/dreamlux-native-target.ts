const DATABASE_PREFIX = "dreamlux_ephemeral_";
const TEST_DATABASE = /^dreamlux_ephemeral_[a-z0-9_]+$/;

export function attestDreamluxNativeTarget(value: string, kind: "admin" | "fixture"): URL {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error("DreamLux native QA requires an explicit local PostgreSQL target");
  }
  const database = target.pathname.slice(1);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol)
    || target.hostname !== "127.0.0.1"
    || target.port !== "55434"
    || target.username !== "dreamlux_parity"
    || !/^[a-f0-9]{64}$/.test(target.password)
    || (target.search !== "" && target.search !== "?sslmode=disable")
    || target.hash !== ""
    || (kind === "admin" ? database !== "postgres" : !TEST_DATABASE.test(database))
  ) {
    throw new Error("Refusing a target outside the independently owned DreamLux QA cluster");
  }
  return target;
}

export function dreamluxFixtureTarget(adminUrl: string, suffix: string): URL {
  const target = attestDreamluxNativeTarget(adminUrl, "admin");
  target.pathname = `${DATABASE_PREFIX}${suffix}`;
  return attestDreamluxNativeTarget(target.href, "fixture");
}
