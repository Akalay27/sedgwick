import { useState, useCallback } from "react";
import { Toast } from "../types";

export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (type: Toast["type"], title: string, message: string) => {
      const toastId = Date.now().toString();
      setToasts((prev) => {
        if (type === "warning" && title === "Duplicate Entries") {
          const existingToast = prev.find(
            (t) => t.title === title && t.type === type
          );
          if (existingToast) {
            return prev.map((t) =>
              t.id === existingToast.id
                ? {
                    ...t,
                    messages: [...t.messages, message],
                    timestamp: Date.now(),
                  }
                : t
            );
          }
        }

        const newToast: Toast = {
          id: toastId,
          type,
          title,
          messages: [message],
          timestamp: Date.now(),
        };

        return [...prev.slice(-4), newToast];
      });
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, setToasts, addToast, dismissToast };
};