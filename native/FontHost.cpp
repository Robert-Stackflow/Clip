#include <windows.h>
#include <iostream>
#include <string>
#include <set>
#include <stdexcept>
std::string utf8(const std::wstring& s){int n=WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0,nullptr,nullptr);std::string out(n,0);WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),out.data(),n,nullptr,nullptr);return out;}
std::string quoted(const std::wstring& w){const auto s=utf8(w);std::string out="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c<32){char b[7];sprintf_s(b,"\\u%04x",c);out+=b;}else out+=c;}return out+'"';}
#include "font-list.h"
int wmain(int argc,wchar_t** argv){try{if(argc==2&&std::wstring(argv[1])==L"fonts")fontList();else if(argc==3&&std::wstring(argv[1])==L"font-source")fontSource(argv[2]);else return 2;return 0;}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
