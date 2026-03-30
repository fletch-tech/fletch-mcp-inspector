import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { CustomProvider } from "@mcpjam/sdk";
import { useAuth } from "@/lib/auth/jwt-auth-context";
import { scopedLocalStorageKey } from "@/lib/hosted-user-storage";

const STORAGE_KEY_BASE = "mcp-inspector-custom-providers";

export interface UseCustomProvidersReturn {
  customProviders: CustomProvider[];
  addCustomProvider: (provider: CustomProvider) => void;
  updateCustomProvider: (index: number, provider: CustomProvider) => void;
  removeCustomProvider: (index: number) => void;
  getCustomProviderByName: (name: string) => CustomProvider | undefined;
}

export function useCustomProviders(): UseCustomProvidersReturn {
  const { user } = useAuth();
  const storageKey = useMemo(
    () => scopedLocalStorageKey(STORAGE_KEY_BASE, user?.id ?? null),
    [user?.id],
  );

  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const isRestoringRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    isRestoringRef.current = true;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomProvider[];
        setCustomProviders(Array.isArray(parsed) ? parsed : []);
      } else {
        setCustomProviders([]);
      }
    } catch (error) {
      console.warn(
        "Failed to load custom providers from localStorage:",
        error,
      );
      setCustomProviders([]);
    }
    queueMicrotask(() => {
      isRestoringRef.current = false;
    });
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || isRestoringRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(customProviders));
    } catch (error) {
      console.warn("Failed to save custom providers to localStorage:", error);
    }
  }, [customProviders, storageKey]);

  const addCustomProvider = useCallback((provider: CustomProvider) => {
    setCustomProviders((prev) => [...prev, provider]);
  }, []);

  const updateCustomProvider = useCallback(
    (index: number, provider: CustomProvider) => {
      setCustomProviders((prev) => {
        const next = [...prev];
        next[index] = provider;
        return next;
      });
    },
    [],
  );

  const removeCustomProvider = useCallback((index: number) => {
    setCustomProviders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const getCustomProviderByName = useCallback(
    (name: string) => {
      return customProviders.find((p) => p.name === name);
    },
    [customProviders],
  );

  return {
    customProviders,
    addCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
    getCustomProviderByName,
  };
}
