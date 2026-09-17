"use client";

import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { getEmployees } from "@/lib/api";

const PAGE_SIZE = 50;
const actionClass = "min-h-12 min-w-12 focus-visible:ring-primary focus-visible:border-primary";
const amharic: Record<string, string> = {
  "Find employee": "ሰራተኛ ፈልግ",
  "Name or employee ID": "ስም ወይም የሰራተኛ መለያ",
  "Employee Link": "የሰራተኛ ማገናኛ",
  "Select Employee": "ሰራተኛ ይምረጡ",
  "Linked employee": "የተገናኘ ሰራተኛ",
  "Clear employee selection": "የሰራተኛ ምርጫን አጽዳ",
  "Loading employees...": "ሰራተኞችን በመጫን ላይ...",
  "No employees available.": "ምንም ሰራተኞች አልተገኙም።",
  "No employees match this search.": "ከዚህ ፍለጋ ጋር የሚዛመዱ ሰራተኞች የሉም።",
  "This employee page is empty. Go back or change the search.": "ይህ የሰራተኞች ገጽ ባዶ ነው። ወደ ኋላ ይመለሱ ወይም ፍለጋውን ይቀይሩ።",
  "You do not have access to the employee list.": "የሰራተኞችን ዝርዝር ለማየት ፈቃድ የለዎትም።",
  "The employee lookup request was rejected.": "የሰራተኞች ፍለጋ ጥያቄ ውድቅ ተደርጓል።",
  "Unable to load employees.": "ሰራተኞችን መጫን አልተቻለም።",
  "Your payment details are unchanged.": "የክፍያዎ ዝርዝሮች አልተለወጡም።",
  "Retry employee lookup": "ሰራተኞችን እንደገና ጫን",
  "Previous employees": "ያለፉት ሰራተኞች",
  "Next employees": "ቀጣይ ሰራተኞች",
  "Previous": "ያለፈው",
  "Next": "ቀጣይ",
  "Page": "ገጽ",
  "of": "ከ",
};

type Selection = { id: string; label: string };

export default function StaffPaymentEmployeePicker({
  value,
  savedLabel,
  onChange,
}: {
  value: string;
  savedLabel?: string | null;
  onChange: (value: string) => void;
}) {
  const { lang } = useLanguage();
  const t = (text: string) => lang === "am" ? amharic[text] ?? text : text;
  const id = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ search: "", page: 1 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const searchPending = search.trim() !== filter.search;

  useEffect(() => {
    if (search.trim() === filter.search) return;
    const timer = setTimeout(() => setFilter({ search: search.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [search, filter.search]);

  const employees = useQuery({
    queryKey: ["staff-payment-employees", filter.search, filter.page],
    queryFn: async ({ signal }) => {
      const response = await getEmployees(
        filter.page, PAGE_SIZE, filter.search || undefined, "active", undefined, undefined, "name", "asc",
        { signal, timeout: 10_000 },
      );
      if (!response || !Array.isArray(response.employees) || !Number.isSafeInteger(response.total) || response.total < 0
          || response.page !== filter.page || response.limit !== PAGE_SIZE
          || response.employees.length > PAGE_SIZE || response.total < response.employees.length
          || (response.employees.length === 0 && response.total > (filter.page - 1) * PAGE_SIZE)
          || (response.employees.length > 0 && (filter.page - 1) * PAGE_SIZE + response.employees.length > response.total)
          || !response.employees.every((employee) => employee && typeof employee.id === "string" && employee.id.trim()
            && typeof employee.full_name === "string" && employee.full_name.trim()
            && typeof employee.employee_id === "string" && employee.employee_id.trim())
          || new Set(response.employees.map((employee) => employee.id)).size !== response.employees.length) {
        throw new Error("Employee lookup returned an invalid response");
      }
      return response;
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const loading = searchPending || employees.isFetching || employees.isPending;
  const rows = employees.data?.employees ?? [];
  const options: Selection[] = rows.map((employee) => ({
    id: employee.id, label: `${employee.full_name} (${employee.employee_id})`,
  }));
  if (value && !options.some((option) => option.id === value)) {
    options.unshift({
      id: value,
      label: selection?.id === value ? selection.label : savedLabel || `${t("Linked employee")} (${value})`,
    });
  }
  const selected = options.find((option) => option.id === value);
  const totalPages = Math.max(1, Math.ceil((employees.data?.total ?? 0) / PAGE_SIZE));
  const status = isAxiosError(employees.error) ? employees.error.response?.status : undefined;
  const errorMessage = status === 401 || status === 403 ? "You do not have access to the employee list."
    : status === 400 || status === 422 ? "The employee lookup request was rejected." : "Unable to load employees.";
  const disabled = loading || employees.isError;

  return (
    <div className="min-w-0 space-y-3" aria-busy={loading}>
      <div>
        <label htmlFor={`${id}-search`} className="mb-1.5 block text-sm font-medium text-foreground">{t("Find employee")}</label>
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("Name or employee ID")}
          maxLength={200}
          className="min-h-12 w-full rounded-xl border border-border bg-card-alt px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>
      <div>
        <label htmlFor={`${id}-select`} className="mb-1.5 block text-sm font-medium text-foreground">{t("Employee Link")}</label>
        <Select.Root value={value} disabled={disabled || options.length === 0} onValueChange={(next) => {
          setSelection(options.find((option) => option.id === next) ?? null);
          onChange(next);
        }}>
          <Select.Trigger
            id={`${id}-select`}
            aria-label={t("Employee Link")}
            aria-describedby={`${id}-status`}
            className="flex min-h-12 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-card-alt px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0 truncate font-semibold" title={selected?.label}>
              <Select.Value placeholder={t("Select Employee")}>{selected?.label}</Select.Value>
            </span>
            <Select.Icon><ChevronDown className="size-4 shrink-0 text-foreground" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={4} collisionPadding={8}
              className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground">
              <Select.Viewport className="max-h-72 space-y-2 p-2">
                {options.map((option) => (
                  <Select.Item key={option.id} value={option.id}
                    className="flex min-h-12 cursor-default items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-card-alt data-[state=checked]:font-semibold">
                    <Select.ItemText className="min-w-0 flex-1 break-words">{option.label}</Select.ItemText>
                    <Select.ItemIndicator><Check className="size-4 shrink-0 text-foreground" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        {value && (
          <Button type="button" variant="ghost" className={`mt-2 ${actionClass}`} disabled={disabled}
            onClick={() => { setSelection(null); onChange(""); }}>
            {t("Clear employee selection")}
          </Button>
        )}
      </div>
      <div id={`${id}-status`} className="min-h-6 text-sm text-foreground">
        {loading ? (
          <p role="status">{t("Loading employees...")}</p>
        ) : employees.isError ? (
          <div role="alert" className="space-y-2">
            <p>{t(errorMessage)} {t("Your payment details are unchanged.")}</p>
            <Button type="button" variant="secondary" className={actionClass} onClick={() => void employees.refetch()}>
              {t("Retry employee lookup")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p role="status">{t(filter.page > 1 ? "This employee page is empty. Go back or change the search."
            : filter.search ? "No employees match this search." : "No employees available.")}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" aria-label={t("Previous employees")} className={actionClass}
          disabled={loading || filter.page <= 1} onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}>
          {t("Previous")}
        </Button>
        <span className="text-sm tabular-nums text-foreground" aria-live="polite">
          {t("Page")} {filter.page}{!disabled && filter.page <= totalPages ? ` ${t("of")} ${totalPages}` : ""}
        </span>
        <Button type="button" variant="secondary" aria-label={t("Next employees")} className={actionClass}
          disabled={disabled || filter.page >= totalPages} onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}>
          {t("Next")}
        </Button>
      </div>
    </div>
  );
}
