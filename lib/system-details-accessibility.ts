export type ProcessSortDirection = "ascending" | "descending";

type SortField = {
  label: string;
  numeric: boolean;
};

export function getProcessSortButtonLabel(field: string, currentDirection: ProcessSortDirection | null, nextDirection: ProcessSortDirection) {
  const currentState = currentDirection ? `currently ${currentDirection}` : "currently unsorted";
  return `Sort by ${field}, ${currentState}. Activate to sort ${field} ${nextDirection}.`;
}

export function getProcessTableCaption(title: string, field: string, direction: ProcessSortDirection) {
  return `${title} processes. Sorted by ${field} in ${direction} order.`;
}

export function getNextProcessSortDirection(field: SortField, isActive: boolean, descending: boolean): ProcessSortDirection {
  if (isActive) return descending ? "ascending" : "descending";
  return field.numeric ? "descending" : "ascending";
}
