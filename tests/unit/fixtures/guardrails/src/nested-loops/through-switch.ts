export function scanModes(rows: string[], mode: string): string {
  let acc = "";
  // OUTER
  for (const row of rows) {
    switch (mode) {
      case "wide": {
        for (const ch of row) {
          acc += ch;
        }
        break;
      }
      default: {
        acc += row;
      }
    }
  }
  return acc;
}
