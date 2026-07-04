"""
Sokoban Solver using SAT (Boilerplate)
--------------------------------------
Instructions:
- Implement encoding of Sokoban into CNF.
- Use PySAT to solve the CNF and extract moves.
- Ensure constraints for player movement, box pushes, and goal conditions.

Grid Encoding:
- 'P' = Player
- 'B' = Box
- 'G' = Goal
- '#' = Wall
- '.' = Empty space
"""

from pysat.formula import CNF
from pysat.solvers import Solver
# Directions for movement
DIRS = {'U': (-1, 0), 'D': (1, 0), 'L': (0, -1), 'R': (0, 1)}
DIRS_LIST=list(DIRS.values())
class SokobanEncoder:
    def _init_(self, grid, T):
        self.grid = grid
        self.T = T
        self.rows = len(grid)
        self.cols = len(grid[0])
        
        self.walls = set()
        self.goals = set()
        self.boxes = []
        self.player_start = None
        
        self._parse_grid()
        self.num_boxes =len(self.boxes)
        self.cnf = CNF()

    def _parse_grid(self):
        for i in range(self.rows):
            for j in range(self.cols):
                cell=self.grid[i][j]
                if cell=='#':
                    self.walls.add((i, j))
                elif cell=='G':
                    self.goals.add((i, j))
                elif cell=='B':
                    self.boxes.append((i, j))
                elif cell=='P':
                    self.player_start=(i, j)
                elif cell=='X':
                    self.boxes.append((i, j))
                    self.goals.add((i, j))
                elif cell=='Y': 
                    self.player_start=(i, j)
                    self.goals.add((i, j))

    def var_player(self, x, y, t):
        if (x, y) in self.walls:
            return None
        return 1+t*(self.rows*self.cols)+x*self.cols+y

    def var_box(self, b, x, y, t):
        if (x, y) in self.walls:
            return None
        setup= self.rows* self.cols* (self.T + 1)
        return setup + t* (self.rows* self.cols * self.num_boxes) + b * (self.rows * self.cols) + x * self.cols + y

    def encode(self):
        T = self.T
        rows,cols=self.rows,self.cols
        
        # Initial state
        px, py = self.player_start
        self.cnf.append([self.var_player(px, py, 0)])
        for b, (bx, by) in enumerate(self.boxes):
            self.cnf.append([self.var_box(b, bx, by, 0)])
        
        # Exactly one player position per timestep
        for t in range(T + 1):
            player_vars=[]
            for x in range(rows):
                for y in range(cols):
                    var=self.var_player(x,y,t)
                    if var is not None:
                        player_vars.append(var)
            self.cnf.append(player_vars)  # At least one
            for i in range(len(player_vars)):
                for j in range(i + 1, len(player_vars)):
                    self.cnf.append([-player_vars[i], -player_vars[j]])  # At most one
        
        # Exactly one position per box per timestep
        for b in range(self.num_boxes):
            for t in range(T + 1):
                box_vars=[]
                for x in range(rows):
                    for y in range(cols):
                        var=self.var_box(b, x, y, t)
                        if var is not None:
                            box_vars.append(var)
                self.cnf.append(box_vars) # At least one
                for i in range(len(box_vars)):
                    for j in range(i + 1, len(box_vars)):
                        self.cnf.append([-box_vars[i], -box_vars[j]])  # At most one
        
        # No two boxes at same position
        for t in range(T + 1):
            for x in range(rows):
                for y in range(cols):
                    if (x, y) in self.walls:
                        continue
                    for b1 in range(self.num_boxes):
                        for b2 in range(b1 + 1, self.num_boxes):
                            var1 = self.var_box(b1, x, y, t)
                            var2 = self.var_box(b2, x, y, t)
                            if var1 is not None and var2 is not None:
                                self.cnf.append([-var1, -var2])
        
        # Player and box cannot occupy same cell
        for t in range(T + 1):
            for x in range(rows):
                for y in range(cols):
                    if (x, y) in self.walls:
                        continue
                    p_var = self.var_player(x, y, t)
                    if p_var is None:
                        continue
                    for b in range(self.num_boxes):
                        b_var = self.var_box(b, x, y, t)
                        if b_var is not None:
                            self.cnf.append([-p_var, -b_var])
        
        # Player movement constraints
        for t in range(T):
            for x in range(rows):
                for y in range(cols):
                    if (x, y) in self.walls:
                        continue
                    p_var = self.var_player(x, y, t)
                    if p_var is None:
                        continue
                    # Player must move to adjacent cell 
                    next_cells = []
                    for dx, dy in DIRS_LIST:
                        nx, ny = x + dx, y + dy
                        if (0 <= nx < rows and 0 <= ny < cols):
                            next_var = self.var_player(nx, ny, t + 1)
                            if next_var is not None:
                                next_cells.append(next_var)
        # Box pushing constraints
        for t in range(T):
            for x in range(rows):
                for y in range(cols):
                    if (x, y) in self.walls:
                        continue
                    p_var=self.var_player(x, y, t)
                    if p_var is None:
                        continue
                    
                    for dx, dy in DIRS_LIST:
                        bx, by = x + dx, y + dy
                        if not (0 <= bx < rows and 0 <= by < cols) or (bx, by) in self.walls:
                            continue
                        
                        # New box position after push
                        new_bx, new_by = bx + dx, by + dy
                        if not (0 <= new_bx < rows and 0 <= new_by < cols) or (new_bx, new_by) in self.walls:
                            continue
                        
                        for b in range(self.num_boxes):
                            # Current box position
                            b_var = self.var_box(b, bx, by, t)
                            if b_var is None:
                                continue
                            
                            # Next player and box positions
                            p_next_var = self.var_player(bx, by, t + 1)
                            b_next_var = self.var_box(b, new_bx, new_by, t + 1)
                            
                            if p_next_var is not None and b_next_var is not None:
                                # If player is here and box is there, then next state must have player there and box pushed
                                self.cnf.append([-p_var, -b_var, p_next_var])
                                self.cnf.append([-p_var, -b_var, b_next_var])
        
        # Box non-pushing constraints (if not pushed, box stays)
        for t in range(T):
            for b in range(self.num_boxes):
                for x in range(rows):
                    for y in range(cols):
                        if (x, y) in self.walls:
                            continue
                        b_var = self.var_box(b, x, y, t)
                        b_next_var = self.var_box(b, x, y, t + 1)
                        if b_var is None or b_next_var is None:
                            continue
                        push_conditions = []
                        for dx, dy in DIRS_LIST:
                            # Player position that could push this box
                            px, py= x - dx, y - dy
                            if not (0 <= px < rows and 0 <= py < cols) or (px, py) in self.walls:
                                continue
                            
                            p_var=self.var_player(px, py, t)
                            if p_var is None:
                                continue
                            push_conditions.append(p_var)
                        
                        # If any push condition is true, the box might move
                        if push_conditions:
                            self.cnf.append([-b_var] + push_conditions + [b_next_var])
                        else:
                            self.cnf.append([-b_var, b_next_var])
        
        # Goal condition - all boxes on goals at final timestep
        for b in range(self.num_boxes):
            goal_vars= []
            for gx, gy in self.goals:
                var= self.var_box(b, gx, gy, T)
                if var is not None:
                    goal_vars.append(var)
            if goal_vars:
                self.cnf.append(goal_vars)
        
        return self.cnf

def decode(model, encoder):
    if model is None:
        return -1
    
    model_set = set(model)
    moves = []
    rows, cols, T = encoder.rows, encoder.cols, encoder.T
    
    # Get player positions at each timestep
    positions= []
    for t in range(T + 1):
        found= None
        for x in range(rows):
            for y in range(cols):
                var= encoder.var_player(x, y, t)
                if var is not None and var in model_set:
                    found= (x, y)
                    break
            if found is not None:
                break
        positions.append(found)
    
    # Convert to moves
    for i in range(T):
        if positions[i] is None or positions[i + 1] is None:
            return -1
        
        x1, y1 = positions[i]
        x2, y2 = positions[i + 1]
        
        if x2==x1 - 1 and y2==y1:
            moves.append("U")
        elif x2==x1 + 1 and y2==y1:
            moves.append("D")
        elif x2==x1 and y2==y1 - 1:
            moves.append("L")
        elif x2==x1 and y2==y1 + 1:
            moves.append("R")
        else:
            pass
    
    # Return the moves as a string
    if moves:
        return "".join(moves) 
    else :
        -1

def solve_sokoban(grid, T):
    """
    DO NOT MODIFY THIS FUNCTION.

    Solve Sokoban using SAT encoding.

    Args:
        grid (list[list[str]]): Sokoban grid.
        T (int): Max number of steps allowed.

    Returns:
        list[str] or "unsat": Move sequence or unsatisfiable.
    """
    encoder = SokobanEncoder(grid, T)
    cnf = encoder.encode()

    with Solver(name='g3') as solver:
        solver.append_formula(cnf)
        if not solver.solve():
            return -1

        model = solver.get_model()
        if not model:
            return -1

        return decode(model, encoder)
    