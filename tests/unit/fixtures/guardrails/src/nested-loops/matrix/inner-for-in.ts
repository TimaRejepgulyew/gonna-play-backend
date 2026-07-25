export function innerForIn(dict: Record<string, string>, items: string[]): string {
  let acc = "";
  // OUTER
  for (let i = 0; i < items.length; i += 1) {
    for (const key in dict) {
      acc += `${key}${i}`;
    }
  }
  return acc;
}
