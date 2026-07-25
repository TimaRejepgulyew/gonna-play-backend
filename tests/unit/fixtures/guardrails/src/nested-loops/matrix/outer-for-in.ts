export function outerForIn(dict: Record<string, string>, items: string[]): string {
  let acc = "";
  // OUTER
  for (const key in dict) {
    for (let j = 0; j < items.length; j += 1) {
      acc += `${key}${j}`;
    }
  }
  return acc;
}
