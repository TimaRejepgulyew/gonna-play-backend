export function innerFor(items: string[]): string {
  let acc = "";
  // OUTER
  for (let i = 0; i < items.length; i += 1) {
    for (let j = 0; j < items.length; j += 1) {
      acc += String(i - j);
    }
  }
  return acc;
}
