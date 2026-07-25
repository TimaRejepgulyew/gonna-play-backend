export function innerForOf(items: string[]): string {
  let acc = "";
  // OUTER
  for (let i = 0; i < items.length; i += 1) {
    for (const item of items) {
      acc += `${item}${i}`;
    }
  }
  return acc;
}
