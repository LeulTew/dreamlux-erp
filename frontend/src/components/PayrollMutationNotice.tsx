import { useEffect, useRef } from "react";
import type { PayrollMutationFailure } from "@/lib/payroll-error";
import { useLanguage } from "@/hooks/use-language";

export default function PayrollMutationNotice({ failure, pending }: {
  failure: PayrollMutationFailure | null;
  pending: boolean;
}) {
  const { lang } = useLanguage();
  const reloadButton = useRef<HTMLButtonElement>(null);
  const shouldFocusReload = failure?.needsReload === true && !pending;
  useEffect(() => {
    if (shouldFocusReload) reloadButton.current?.focus();
  }, [shouldFocusReload]);

  if (pending) {
    return <p role="status" className="text-sm text-muted-foreground">
      {lang === "am" ? "የክፍያ ለውጥ በማስቀመጥ ላይ..." : "Updating payroll..."}
    </p>;
  }
  if (!failure) return null;
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-card p-4 text-sm text-foreground">
      <p className="font-semibold">{failure.needsReload
        ? (lang === "am" ? "የክፍያው ለውጥ መቀመጡ አልተረጋገጠም" : "Payroll change not confirmed")
        : (lang === "am" ? "የክፍያው ለውጥ አልተሳካም" : "Payroll change failed")}</p>
      <p>{failure.needsReload
        ? (lang === "am" ? "ለውጡ አስቀድሞ ተቀምጦ ሊሆን ይችላል።" : "The change may already have been saved.")
        : failure.message}</p>
      {failure.needsReload ? (
        <>
          <p>{lang === "am"
            ? "እንደገና ከመሞከርዎ በፊት ገጹን እንደገና ይጫኑና የክፍያ ታሪኩን ያረጋግጡ። ተጨማሪ ለውጦች ታግደዋል።"
            : "Reload and check payroll history before retrying. Further changes are blocked."}</p>
          <button ref={reloadButton} type="button" onClick={() => window.location.reload()}
            className="min-h-12 rounded-lg border border-border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-primary">
            {lang === "am" ? "የክፍያ ገጹን እንደገና ጫን" : "Reload payroll"}
          </button>
        </>
      ) : (
        <p>{lang === "am" ? "ስህተቱን ይመርምሩና እንደገና በእጅ ይሞክሩ።" : "Review the error and retry manually."}</p>
      )}
    </div>
  );
}
