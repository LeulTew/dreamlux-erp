import { Suspense } from "react";
import AuthLayout from "@/components/AuthLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ConditionStock } from "@/components/inventory/ConditionStock";

export default function ConditionStockPage() {
  return <AuthLayout><Suspense fallback={<Skeleton className="h-96 w-full" />}><ConditionStock /></Suspense></AuthLayout>;
}
