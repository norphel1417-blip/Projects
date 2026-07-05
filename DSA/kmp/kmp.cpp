#include "kmp.h"

// Fills lps[] for given pattern pat[0..M-1]
void computeLPSArray(const std::string &pat, std::vector<int> &lps) {
//Implement here
    int M = pat.size();
    int len = 0; // length of the previous longest prefix suffix
    lps[0] = 0; // lps[0] is always 0

    int i = 1;
    while (i < M) {
        if (pat[i] == pat[len]) {
            len++;
            lps[i] = len;
            i++;
        } else { // (pat[i] != pat[len])
            if (len != 0) {
                len = lps[len - 1];
            } else { // if (len == 0)
                lps[i] = 0;
                i++;
            }
        }
    }
}

// KMP search: returns vector of starting indices of pattern in text
std::vector<int> KMPSearch(const std::string &pat, const std::string &txt) {
    int N = txt.size();
    int M = pat.size();
    std::vector<int> lps(M);
    computeLPSArray(pat, lps);
    std::vector<int> result;
    int i = 0; // index for txt
    int j = 0; // index for pat
    while (i < N) {
        if (pat[j] == txt[i]) {
            i++;
            j++;
        }
        if (j == M) {
            result.push_back(i - j);
            j = lps[j - 1];
        } else if (i < N && pat[j] != txt[i]) {
            if (j != 0) {
                j = lps[j - 1];
            } else {
                i++;
            }
        }
    }
    return result;
}
