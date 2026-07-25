function apply(cells: string[], visit: (cell: string) => void): void {
  for (const cell of cells) {
    visit(cell);
  }
}

export function collectRows(rows: string[][]): string[] {
  const acc: string[] = [];
  for (const row of rows) {
    apply(row, (cell) => {
      for (const ch of cell) {
        acc.push(ch);
      }
    });
  }
  return acc;
}
