export function outerWhile(items: string[]): string {
  let acc = "";
  let cursor = items.length;
  // OUTER
  while (cursor > 0) {
    for (let j = 0; j < items.length; j += 1) {
      acc += String(j);
    }
    cursor -= 1;
  }
  return acc;
}
