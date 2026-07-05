#include<iostream>
#include "kmp.h"

// Driver code
int main(int argc, char** argv) {
    if (argc > 1) {
        if (freopen(argv[1], "r", stdin) == nullptr) // cin redirects to file argv[1]
        {
            std::cerr << "Error: Could not open input file " << argv[1] << std::endl;
            return 1;
        }
    }
    const int maxSize = 10000; // Maximum size for character arrays
    
    char pat[maxSize];
    char txt[maxSize];
    std::cin.getline(pat, maxSize);
    std::cin.getline(txt, maxSize);
	
    std::vector<int> matches = KMPSearch(pat, txt);

    for (int idx : matches) {
        std::cout << "Found pattern at index " << idx << "\n";
    };
	return 0;
}
