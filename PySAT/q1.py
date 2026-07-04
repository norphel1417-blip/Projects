"""
sudoku_solver.py

Implement the function solve_sudoku(grid: List[List[int]]) -> List[List[int]] using a SAT solver from PySAT.
"""

from pysat.formula import CNF
from pysat.solvers import Solver
from typing import List

def solve_sudoku(grid: List[List[int]]) -> List[List[int]]:
    """Solves a Sudoku puzzle using a SAT solver. Input is a 2D grid with 0s for blanks."""
    
    N=9
    digits=range(1,N+1)
    rows=range(1,N+1)
    cols=range(1,N+1)

    cnf=CNF()
    def v(r, c, d):
        return 100 * r + 10 * c + d
    # 1. Each cell has at least one number
    for r in rows:
        for c in cols:
            cnf.append([v(r, c, d) for d in digits])
    for r in rows:
        for c in cols:
            for d1 in digits:
                for d2 in digits:
                    if d1<d2:
                        cnf.append([-v(r, c, d1), -v(r, c, d2)])
    # 2. Each number appears exactly once in each row
    for r in rows:
        for d in digits:
            cnf.append([v(r, c, d) for c in cols]) 
            for c1 in cols:
                for c2 in cols:
                    if c1<c2:
                        cnf.append([-v(r, c1, d), -v(r, c2, d)]) 
    # 3. Each number appears exactly once in each column
    for c in cols:
        for d in digits:
            cnf.append([v(r, c, d) for r in rows])
            for r1 in rows:
                for r2 in rows:
                    if r1<r2:
                        cnf.append([-v(r1, c, d), -v(r2, c, d)])
    # 4. Each number appears exactly once in each 3x3 subgrid
    for br in range(0, N, 3):
        for bc in range(0, N, 3):
            for d in digits:
                clause=[]
                cells=[]
                for r in range(1 + br, 4 + br):
                    for c in range(1 + bc, 4 + bc):
                        clause.append(v(r, c, d))
                        cells.append((r, c))
                cnf.append(clause) 
                for i in range(len(cells)):
                    for j in range(i + 1, len(cells)):
                        r1, c1 =cells[i]
                        r2, c2 =cells[j]
                        cnf.append([-v(r1, c1, d), -v(r2, c2, d)])
    # 5. Encode given clues
    for r in rows:
        for c in cols:
            if grid[r - 1][c - 1] != 0:
                d=grid[r - 1][c - 1]
                cnf.append([v(r, c, d)])

    # Solve using PySAT
    with Solver(bootstrap_with=cnf) as solver:
        if not solver.solve():
            raise ValueError()
        model=solver.get_model()

    # Extract solution
    solution = [[0] * N for _ in range(N)]
    for r in rows:
        for c in cols:
            for d in digits:
                if v(r, c, d) in model:
                    solution[r - 1][c - 1]=d
    return solution