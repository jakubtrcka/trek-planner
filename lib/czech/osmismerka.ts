// Czech osmisměrka (word search) 20×20 grid
export const CESKA_OSMISMERKA_GRID: string[][] = [
  ["E","H","Ř","E","B","E","N","E","C","I","N","I","V","H","O","R","K","A","J","V"],
  ["L","C","E","D","A","R","H","A","B","Á","B","A","S","C","E","N","E","M","A","K"],
  ["Á","V","Ě","T","R","N","Í","K","S","J","C","P","V","B","R","D","O","R","V","V"],
  ["K","O","I","S","H","O","M","O","L","K","A","H","A","R","W","J","T","V","O","H"],
  ["S","D","Á","V","O","L","D","E","J","C","A","H","L","H","C","A","X","H","R","R"],
  ["A","R","O","H","Í","V","A","R","K","T","E","L","M","U","O","H","C","M","N","Á"],
  ["N","Ž","Á","R","T","S","K","N","A","K","O","P","C","I","M","R","U","E","Í","D"],
  ["S","K","A","L","K","A","Á","U","A","K","R","Ů","H","E","V","H","E","C","K","E"],
  ["H","C","R","V","Í","N","Č","I","N","E","B","I","Š","Í","O","C","E","K","X","K"],
  ["M","T","Y","N","U","Č","I","K","S","Ě","H","L","Č","M","F","P","G","O","F","L"],
  ["K","K","H","N","H","I","P","A","T","Ů","H","Š","O","K","O","Z","I","N","E","C"],
  ["T","O","C","P","E","H","Š","Š","R","V","I","L","K","K","U","K","H","U","Z","Q"],
  ["Č","S","R","K","H","A","I","A","S","L","E","B","S","K","K","Í","O","N","Q","Č"],
  ["E","T","V","A","K","D","Í","L","H","Y","V","V","I","V","Š","L","L","A","K","Á"],
  ["R","E","S","K","A","L","K","Y","Q","R","Z","Y","D","Y","R","H","Ý","V","L","N"],
  ["N","L","Q","R","W","O","N","P","E","K","L","O","A","S","V","U","V","R","Ů","E"],
  ["Ý","Í","H","E","Z","N","V","J","W","X","B","N","R","O","A","O","R","Š","Č","M"],
  ["L","K","K","A","L","V","Á","R","I","E","H","Q","H","K","N","R","C","Í","E","A"],
  ["E","I","U","W","X","H","C","E","V","O","K","U","B","Á","H","K","H","C","K","K"],
  ["S","V","L","Y","K","Í","N","E","B","I","Š","V","J","O","L","O","Q","H","D","I"],
];

export function wordSearchCheck(grid: string[][], word: string): boolean {
  const rows = grid.length;
  const cols = grid[0].length;
  const len = word.length;
  if (len < 3 || len > Math.max(rows, cols)) return false;
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as const;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of DIRS) {
        let ok = true;
        for (let i = 1; i < len; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] !== word[i]) {
            ok = false; break;
          }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}
