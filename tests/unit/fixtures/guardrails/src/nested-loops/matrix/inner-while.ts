export function innerWhile(items: string[]): string {
  let acc = "";
  // OUTER
  for (let i = 0; i < items.length; i += 1) {
    let cursor = items.length;
    while (cursor > 0) {
      acc += String(cursor);
      cursor -= 1;
    }
  }
  return acc;
}
