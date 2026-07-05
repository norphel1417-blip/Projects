#ifndef KMP_H
#define KMP_H

#include <string>
#include <vector>

// Fills lps[] for given pattern pat[0..M-1]
void computeLPSArray(const std::string &pat, std::vector<int> &lps);

// KMP search function: returns vector of starting indices of pattern in text
std::vector<int> KMPSearch(const std::string &pat, const std::string &txt);

#endif // KMP_H
