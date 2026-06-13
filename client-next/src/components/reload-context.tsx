"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Close } from "@nsmr/pixelart-react";

interface ReloadContextType {
  needsReload: boolean;
  triggerReload: () => void;
  dismissReload: () => void;
}

const ReloadContext = createContext<ReloadContextType>({
  needsReload: false,
  triggerReload: () => {},
  dismissReload: () => {},
});

export function useReload() {
  return useContext(ReloadContext);
}

export function ReloadProvider({ children }: { children: React.ReactNode }) {
  const [needsReload, setNeedsReload] = useState(false);

  const triggerReload = useCallback(() => {
    setNeedsReload(true);
  }, []);

  const dismissReload = useCallback(() => {
    setNeedsReload(false);
  }, []);

  return (
    <ReloadContext.Provider value={{ needsReload, triggerReload, dismissReload }}>
      {children}
    </ReloadContext.Provider>
  );
}

export function ReloadBanner() {
  const { needsReload, dismissReload } = useReload();

  if (!needsReload) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-sm font-medium text-amber-800">
          Configuration saved. Hot-reload required to activate changes.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={dismissReload}>
          <Close className="h-3 w-3 mr-1" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
