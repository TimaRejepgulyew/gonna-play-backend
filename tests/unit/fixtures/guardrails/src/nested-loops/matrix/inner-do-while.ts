export function innerDoWhile(items: string[]): string {
  let acc = "";
  // OUTER
  for (let i = 0; i < items.length; i += 1) {
    let cursor = items.length;
    do {
      acc += String(cursor);
      cursor -= 1;
    } while (cursor > 0);
  }
  return acc;
}
