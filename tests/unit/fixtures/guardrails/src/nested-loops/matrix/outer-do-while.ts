export function outerDoWhile(items: string[]): string {
  let acc = "";
  let cursor = items.length;
  // OUTER
  do {
    for (let j = 0; j < items.length; j += 1) {
      acc += String(j);
    }
    cursor -= 1;
  } while (cursor > 0);
  return acc;
}
