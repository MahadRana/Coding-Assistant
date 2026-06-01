import { useCallback, useEffect, useState } from "react";

export interface HistoryItem {
  id: string;
  task: string;
  status: "done" | "error" | "in_progress";
  createdAt: number;
  output?: string;
  error?: string;
}

const STORAGE_KEY = "ca:history:v1";
const MAX_ITEMS = 30;

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: HistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota exceeded — drop silently */
  }
}

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(load());
  }, []);

  const upsert = useCallback((item: HistoryItem) => {
    setItems((prev) => {
      const without = prev.filter((p) => p.id !== item.id);
      const next = [item, ...without].slice(0, MAX_ITEMS);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    save([]);
    setItems([]);
  }, []);

  return { items, upsert, remove, clear };
}
