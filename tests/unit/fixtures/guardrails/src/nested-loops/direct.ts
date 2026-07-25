export function joinGrid(grid: string[][]): string {
  let acc = "";
  // OUTER
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      acc += String(row + col);
    }
  }
  return acc;
}
