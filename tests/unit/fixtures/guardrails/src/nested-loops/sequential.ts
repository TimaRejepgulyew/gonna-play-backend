export function countTwice(items: string[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    total += i;
  }
  for (let j = 0; j < items.length; j += 1) {
    total += j;
  }
  return total;
}
