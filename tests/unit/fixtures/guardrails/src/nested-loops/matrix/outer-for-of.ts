export function outerForOf(items: string[]): string {
  let acc = "";
  // OUTER
  for (const item of items) {
    for (let j = 0; j < items.length; j += 1) {
      acc += `${item}${j}`;
    }
  }
  return acc;
}
