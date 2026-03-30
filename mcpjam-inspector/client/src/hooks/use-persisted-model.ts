import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth/jwt-auth-context";
import { scopedLocalStorageKey } from "@/lib/hosted-user-storage";
import { HOSTED_MODE } from "@/lib/config";

const STORAGE_KEY_BASE = "mcp-inspector-selected-model";

export interface UsePersistedModelReturn {
  selectedModelId: string | null;
  setSelectedModelId: (modelId: string | null) => void;
}

/**
 * Hook to persist the user's last selected model ID to localStorage.
 * Returns the selected model ID and a setter function.
 */
export function usePersistedModel(): UsePersistedModelReturn {
  const { user } = useAuth();
  const storageKey = useMemo(
    () =>
      HOSTED_MODE
        ? scopedLocalStorageKey(STORAGE_KEY_BASE, user?.id ?? null)
        : STORAGE_KEY_BASE,
    [user?.id],
  );

  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(
    null,
  );
  const isRestoringRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    isRestoringRef.current = true;
    try {
      const stored = localStorage.getItem(storageKey);
      setSelectedModelIdState(stored || null);
    } catch (error) {
      console.warn("Failed to load selected model from localStorage:", error);
      setSelectedModelIdState(null);
    }
    queueMicrotask(() => {
      isRestoringRef.current = false;
    });
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || isRestoringRef.current) return;
    try {
      if (selectedModelId) {
        localStorage.setItem(storageKey, selectedModelId);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn("Failed to save selected model to localStorage:", error);
    }
  }, [selectedModelId, storageKey]);

  const setSelectedModelId = useCallback((modelId: string | null) => {
    setSelectedModelIdState(modelId);
  }, []);

  return {
    selectedModelId,
    setSelectedModelId,
  };
}
