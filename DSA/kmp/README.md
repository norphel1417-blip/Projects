# Knuth-Morris-Pratt (KMP) Algorithm Implementation

## Problem Statement

You are required to implement the **Knuth-Morris-Pratt (KMP) algorithm** for string pattern matching. The task involves completing two functions:

1. **`computeLPSArray`** – Preprocesses the pattern to generate the Longest Prefix Suffix (LPS) array.
2. **`KMPSearch`** – Finds all occurrences of the pattern in the text and returns the starting indices in a vector.

---

## Input Format

The program expects **two lines of input**:

1. **First line**: Pattern string to search for.
2. **Second line**: Text string where the pattern is searched.

**Note:** The strings do not contain whitespace or newline characters.

---

## Output Format

* The program returns a vector containing all starting indices of the matching pattern in the text.
* Each occurrence is printed on a **separate line** by the main function.
* Multiple occurrences are possible.

---

## Functions to Implement

### 1. `computeLPSArray`

```cpp
void computeLPSArray(const string &pat, vector<int> &lps);
```

* **Purpose:** Preprocess the pattern and fill the LPS array.
* **Parameters:**

  * `pat` – The pattern string.
  * `lps` – Vector to store the Longest Prefix Suffix values.

---

### 2. `KMPSearch`

```cpp
vector<int> KMPSearch(const string &pat, const string &txt);
```

* **Purpose:** Search for the pattern in the text using the KMP algorithm.
* **Parameters:**

  * `pat` – Pattern string.
  * `txt` – Text string.
* **Returns:** Vector of starting indices of all pattern occurrences in the text.

---

## Compilation & Running Instructions

1. Run the following command to compile and check on testcases:

```bash
make
```

## Example

### Input

```
abc
abcabcabc
```

### Output

```
0
3
6
```

---

## Notes

* The KMP algorithm allows **efficient pattern searching** with time complexity **O(N + M)**, where N is the length of the text and M is the length of the pattern.


# Make Commands

```
make             # Build and Run Tests
make build       # Build
make runtests    # Run Tests
make clean       # Clean Temporary Files
```
Please read Makefile to understand the above commands!

# VS Code interface

You can open this folder in VS Code. The problem folder is configured 
to enable debugging.

After opening the folder, click on Run > Start Debugging or press F5.
This will run your program on input ./test/test1/input.txt.
You may place breakpoints to pause the program at any desired location.

You can modify "./.vscode/launch.json" to run any test of your choice.

In some labs, there may be multiple binaries, and you may need to modify 
the binary name in the ./.vscode/settings.json file.

```
    "problem": "<binary>",
```

# General Instructions

- Read all .h and .cpp files before starting.
- Do not include any additional header files.
- Do not modify files other than the specified files. Any other changes 
  will not be considered during evaluation.
- You are expected to submit an efficient implementation. Inefficient 
  solutions will lose marks.

