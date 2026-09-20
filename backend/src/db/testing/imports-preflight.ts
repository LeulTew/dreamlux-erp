import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

if (process.env.DREAMLUX_NATIVE_IMPORT_REQUIRED === "1") {
  const target = process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL?.trim();
  if (!target) {
    throw new Error("Native import verification requires the explicitly attested independent DreamLux PostgreSQL target");
  }
  attestDreamluxNativeTarget(target, "admin");
}
