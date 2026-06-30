"use client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            // Skip notification-internal mutations to avoid redundant invalidation loops
            const key = mutation.options.mutationKey;
            if (Array.isArray(key) && key.includes("notification-action")) return;

            // Instantly refresh the bell badge + dropdown list after any CRUD mutation
            queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
            queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
          },
        }),
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster
        position="bottom-right"
        expand={false}
        visibleToasts={6}
        closeButton
      />
    </QueryClientProvider>
  );
}
