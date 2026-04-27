import { useMemo } from "react";

interface UseModuleSidebarOptions<T> {
  items: T[];
  searchQuery: string;
  getSearchText: (item: T) => string;
}

interface UseModuleSidebarResult<T> {
  filtered: T[];
}

export function useModuleSidebar<T>({
  items,
  searchQuery,
  getSearchText,
}: UseModuleSidebarOptions<T>): UseModuleSidebarResult<T> {
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => getSearchText(item).toLowerCase().includes(query));
  }, [items, searchQuery, getSearchText]);

  return { filtered };
}
