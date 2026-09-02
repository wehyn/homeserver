export function hasAccessibleTextAlternative(visualLabel: string, textAlternative: string) {
  return visualLabel.trim().length > 0 && textAlternative.trim().length > 0;
}
