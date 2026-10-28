export interface PuzzleAssignment {
  /** One distinct zero-based column for every row. */
  readonly columns: readonly number[];
  readonly cost: number;
}

/** Minimum-cost perfect matching by successive augmenting paths and dual potentials, bounded to 64 cells. */
export function minimumPuzzleAssignment(matrix: readonly (readonly number[])[], forbidden?: { readonly row: number; readonly column: number }): PuzzleAssignment | null {
  const size = matrix.length;
  if (!Array.isArray(matrix) || size < 1 || size > 64 || Array.from({ length: size }, (_, i) => matrix[i]).some(row => !Array.isArray(row) || row.length !== size || Array.from(row).some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e6))) throw new RangeError("Invalid puzzle assignment matrix");
  if (forbidden && (!Number.isInteger(forbidden.row) || !Number.isInteger(forbidden.column) || forbidden.row < 0 || forbidden.column < 0 || forbidden.row >= size || forbidden.column >= size)) throw new RangeError("Invalid forbidden assignment edge");
  const u = new Float64Array(size + 1), v = new Float64Array(size + 1), pairedRow = new Int32Array(size + 1);
  for (let row = 1; row <= size; row++) {
    pairedRow[0] = row;
    const best = new Float64Array(size + 1).fill(Infinity), previous = new Int32Array(size + 1), used = new Uint8Array(size + 1);
    let column = 0;
    do {
      used[column] = 1;
      const activeRow = pairedRow[column]!;
      let delta = Infinity, next = 0;
      for (let candidate = 1; candidate <= size; candidate++) if (!used[candidate]) {
        const blocked = forbidden?.row === activeRow - 1 && forbidden.column === candidate - 1;
        const reduced = blocked ? Infinity : matrix[activeRow - 1]![candidate - 1]! - u[activeRow]! - v[candidate]!;
        if (reduced < best[candidate]!) { best[candidate] = reduced; previous[candidate] = column; }
        if (best[candidate]! < delta) { delta = best[candidate]!; next = candidate; }
      }
      if (!Number.isFinite(delta)) return null;
      for (let candidate = 0; candidate <= size; candidate++) {
        if (used[candidate]) { u[pairedRow[candidate]!]! += delta; v[candidate]! -= delta; }
        else best[candidate]! -= delta;
      }
      column = next;
    } while (pairedRow[column] !== 0);
    do { const next = previous[column]!; pairedRow[column] = pairedRow[next]!; column = next; } while (column !== 0);
  }
  const columns = Array<number>(size);
  for (let column = 1; column <= size; column++) columns[pairedRow[column]! - 1] = column - 1;
  return Object.freeze({ columns: Object.freeze(columns), cost: columns.reduce((sum, column, row) => sum + matrix[row]![column]!, 0) });
}
