"use client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: (_data, _variables, _context, mutation) => {
          const key = mutation.options.mutationKey;
          if (Array.isArray(key) && key.includes("notification-action")) return;

          // Instantly trigger query invalidation for notifications
          client.invalidateQueries({ queryKey: ["notifications-unread-count"] });
          client.invalidateQueries({ queryKey: ["notifications-recent"] });
          client.invalidateQueries({ queryKey: ["notifications-list"] });
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30 * 1000,
          retry: 1,
        },
      },
    });

    return client;
  });

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
