#define NOMINMAX
#include <windows.h>
#include <wincodec.h>
#include <shlobj.h>
#include <uiautomation.h>
#include <oleacc.h>
#include <wrl/client.h>
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <cmath>
#include <io.h>
#include <fcntl.h>
using Microsoft::WRL::ComPtr;
static bool caretRect(HWND hwnd,double x,double y,double width,double height,const char* source){
 RECT bounds{};
 if(!std::isfinite(x)||!std::isfinite(y)||!std::isfinite(width)||!std::isfinite(height)||width<0||height<=0||height>=512||!GetWindowRect(hwnd,&bounds)||x<bounds.left||x>bounds.right||y<bounds.top||y+height>bounds.bottom+2||GetAncestor(GetForegroundWindow(),GA_ROOTOWNER)!=hwnd)return false;
 std::cout<<"{\"x\":"<<x<<",\"y\":"<<y<<",\"width\":"<<std::max(1.0,width)<<",\"height\":"<<height<<",\"source\":\""<<source<<"\"}";return true;
}
// Read geometry only. MSAA covers custom carets, while UIA covers modern text
// providers. A disposable process bounds an unresponsive provider's lifetime.
static void caret(HWND hwnd,DWORD expected){
 DWORD pid=0;GetWindowThreadProcessId(hwnd,&pid);if(pid!=expected||!IsWindow(hwnd)||GetAncestor(GetForegroundWindow(),GA_ROOTOWNER)!=hwnd){std::cout<<"null";return;}
 GUITHREADINFO info{sizeof(GUITHREADINFO)};
 if(GetGUIThreadInfo(0,&info)){
  if(info.hwndCaret&&(info.flags&GUI_CARETBLINKING)){RECT rect=info.rcCaret;MapWindowPoints(info.hwndCaret,nullptr,reinterpret_cast<POINT*>(&rect),2);if(caretRect(hwnd,rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,"win32"))return;}
  if(info.hwndFocus){ComPtr<IAccessible> accessible;long x=0,y=0,width=0,height=0;VARIANT child{};child.vt=VT_I4;child.lVal=CHILDID_SELF;
   if(SUCCEEDED(AccessibleObjectFromWindow(info.hwndFocus,OBJID_CARET,IID_PPV_ARGS(&accessible)))&&accessible&&accessible->accLocation(&x,&y,&width,&height,child)==S_OK&&caretRect(hwnd,x,y,width,height,"msaa"))return;
  }
 }
 ComPtr<IUIAutomation> automation;ComPtr<IUIAutomationElement> focused;
 if(FAILED(CoCreateInstance(CLSID_CUIAutomation,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&automation)))||FAILED(automation->GetFocusedElement(&focused))||!focused){std::cout<<"null";return;}
 BOOL hasFocus=FALSE;focused->get_CurrentHasKeyboardFocus(&hasFocus);
 ComPtr<IUIAutomationTextPattern2> pattern;ComPtr<IUIAutomationTextRange> range;BOOL active=FALSE;
 // Modern input controls can be hosted by another process (including Windows
 // Search and browser renderers). The foreground identity and screen rectangle
 // are the boundary; requiring the focused provider's PID to match loses them.
 if(!hasFocus){std::cout<<"null";return;}
 if(SUCCEEDED(focused->GetCurrentPatternAs(UIA_TextPattern2Id,IID_PPV_ARGS(&pattern)))&&pattern)pattern->GetCaretRange(&active,&range);
 if(!active||!range){
  // Some Chromium providers expose TextPattern but not TextPattern2.
  ComPtr<IUIAutomationTextPattern> text;ComPtr<IUIAutomationTextRangeArray> selection;int count=0;
  if(SUCCEEDED(focused->GetCurrentPatternAs(UIA_TextPatternId,IID_PPV_ARGS(&text)))&&text&&SUCCEEDED(text->GetSelection(&selection))&&selection&&SUCCEEDED(selection->get_Length(&count))&&count==1&&SUCCEEDED(selection->GetElement(0,&range))&&range){range->MoveEndpointByRange(TextPatternRangeEndpoint_Start,range.Get(),TextPatternRangeEndpoint_End);active=TRUE;}
 }
 if(!active||!range){std::cout<<"null";return;}
 SAFEARRAY* rectangles=nullptr;bool previous=false;range->GetBoundingRectangles(&rectangles);
 if(!rectangles||SafeArrayGetDim(rectangles)!=1||rectangles->rgsabound[0].cElements<4){
  if(rectangles)SafeArrayDestroy(rectangles);rectangles=nullptr;int moved=0;
  range->MoveEndpointByUnit(TextPatternRangeEndpoint_End,TextUnit_Character,1,&moved);
  if(!moved){range->MoveEndpointByUnit(TextPatternRangeEndpoint_Start,TextUnit_Character,-1,&moved);previous=true;}
  if(moved)range->GetBoundingRectangles(&rectangles);
 }
 double* data=nullptr;bool printed=false;
 if(rectangles&&SafeArrayGetDim(rectangles)==1&&rectangles->rgsabound[0].cElements>=4&&SUCCEEDED(SafeArrayAccessData(rectangles,reinterpret_cast<void**>(&data)))){
  const double x=data[0]+(previous?data[2]:0),y=data[1],height=data[3];printed=caretRect(hwnd,x,y,1,height,"uia");
  SafeArrayUnaccessData(rectangles);
 }
 if(rectangles)SafeArrayDestroy(rectangles);if(!printed)std::cout<<"null";
}
static void encodeImage(IWICImagingFactory* factory,IWICBitmapSource* image){ComPtr<IStream> output;if(FAILED(CreateStreamOnHGlobal(nullptr,TRUE,&output)))throw 1;ComPtr<IWICBitmapEncoder> encoder;if(FAILED(factory->CreateEncoder(GUID_ContainerFormatPng,nullptr,&encoder))||FAILED(encoder->Initialize(output.Get(),WICBitmapEncoderNoCache)))throw 1;ComPtr<IWICBitmapFrameEncode> frame;ComPtr<IPropertyBag2> props;if(FAILED(encoder->CreateNewFrame(&frame,&props))||FAILED(frame->Initialize(props.Get()))||FAILED(frame->WriteSource(image,nullptr))||FAILED(frame->Commit())||FAILED(encoder->Commit()))throw 1;STATSTG info{};if(FAILED(output->Stat(&info,STATFLAG_NONAME))||info.cbSize.QuadPart>256*1024)throw 1;LARGE_INTEGER zero{};output->Seek(zero,STREAM_SEEK_SET,nullptr);std::vector<char> bytes(static_cast<size_t>(info.cbSize.QuadPart));ULONG count=0;if(FAILED(output->Read(bytes.data(),static_cast<ULONG>(bytes.size()),&count))||count!=bytes.size())throw 1;std::cout.write(bytes.data(),bytes.size());SecureZeroMemory(bytes.data(),bytes.size());}
static void encodeIcon(IWICImagingFactory* factory,IWICBitmapSource* image){
 constexpr UINT size=128,content=120,stride=size*4;
 ComPtr<IWICFormatConverter> converted;
 if(FAILED(factory->CreateFormatConverter(&converted))||FAILED(converted->Initialize(image,GUID_WICPixelFormat32bppPBGRA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom)))throw 1;
 UINT width=0,height=0;if(FAILED(converted->GetSize(&width,&height))||!width||!height||width>256||height>256)throw 1;
 std::vector<BYTE> pixels(width*height*4);if(FAILED(converted->CopyPixels(nullptr,width*4,static_cast<UINT>(pixels.size()),pixels.data())))throw 1;
 UINT left=width,top=height,right=0,bottom=0;
 for(UINT y=0;y<height;y++)for(UINT x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>8){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}
 if(left>=right||top>=bottom)throw 1;
 // Give every application the same visible extent, without stretching its logo.
 WICRect rect{static_cast<INT>(left),static_cast<INT>(top),static_cast<INT>(right-left),static_cast<INT>(bottom-top)};
 ComPtr<IWICBitmapClipper> cropped;if(FAILED(factory->CreateBitmapClipper(&cropped))||FAILED(cropped->Initialize(converted.Get(),&rect)))throw 1;
 const double scale=static_cast<double>(content)/std::max(rect.Width,rect.Height);
 const UINT w=std::max(1u,static_cast<UINT>(std::round(rect.Width*scale))),h=std::max(1u,static_cast<UINT>(std::round(rect.Height*scale)));
 ComPtr<IWICBitmapScaler> scaled;if(FAILED(factory->CreateBitmapScaler(&scaled))||FAILED(scaled->Initialize(cropped.Get(),w,h,WICBitmapInterpolationModeFant)))throw 1;
 std::vector<BYTE> canvas(size*stride,0);const UINT offset=((size-h)/2)*stride+((size-w)/2)*4;
 if(FAILED(scaled->CopyPixels(nullptr,stride,static_cast<UINT>(canvas.size())-offset,canvas.data()+offset)))throw 1;
 ComPtr<IWICBitmap> normalized;if(FAILED(factory->CreateBitmapFromMemory(size,size,GUID_WICPixelFormat32bppPBGRA,stride,static_cast<UINT>(canvas.size()),canvas.data(),&normalized)))throw 1;
 encodeImage(factory,normalized.Get());
}
// Read the actual resource instead of the Shell's potentially stale generic icon.
static void programIcon(const std::wstring& file){
 if(file.size()<7||file.size()>=32768||!((file[0]>=L'A'&&file[0]<=L'Z')||(file[0]>=L'a'&&file[0]<=L'z'))||file[1]!=L':'||file[2]!=L'\\'||_wcsicmp(file.c_str()+file.size()-4,L".exe"))throw 1;
 const auto attributes=GetFileAttributesW(file.c_str());if(attributes==INVALID_FILE_ATTRIBUTES||(attributes&FILE_ATTRIBUTE_DIRECTORY))throw 1;
 std::vector<std::wstring> sources;wchar_t system[MAX_PATH]{},windows[MAX_PATH]{};GetSystemDirectoryW(system,MAX_PATH);GetWindowsDirectoryW(windows,MAX_PATH);
 const auto prefix=std::wstring(system)+L"\\";if(file.size()>prefix.size()&&!_wcsnicmp(file.c_str(),prefix.c_str(),prefix.size())){const auto name=file.substr(file.find_last_of(L'\\')+1),mun=std::wstring(windows)+L"\\SystemResources\\"+name+L".mun";if(GetFileAttributesW(mun.c_str())!=INVALID_FILE_ATTRIBUTES)sources.push_back(mun);}sources.push_back(file);
 for(const auto& source:sources){
  HICON iconLarge=nullptr,iconSmall=nullptr;const auto result=SHDefExtractIconW(source.c_str(),0,0,&iconLarge,&iconSmall,MAKELONG(128,32));
  try{if(SUCCEEDED(result)&&iconLarge){ComPtr<IWICImagingFactory> factory;if(FAILED(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory))))throw 1;ComPtr<IWICBitmap> image;if(FAILED(factory->CreateBitmapFromHICON(iconLarge,&image)))throw 1;encodeIcon(factory.Get(),image.Get());DestroyIcon(iconLarge);if(iconSmall)DestroyIcon(iconSmall);return;}}
  catch(...){if(iconLarge)DestroyIcon(iconLarge);if(iconSmall)DestroyIcon(iconSmall);throw;}
  if(iconLarge)DestroyIcon(iconLarge);if(iconSmall)DestroyIcon(iconSmall);
 }
 throw 1;
}
int wmain(int argc,wchar_t** argv){SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);_setmode(_fileno(stdout),_O_BINARY);const HRESULT init=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(init))return 1;int result=0;try{if(argc==3&&wcscmp(argv[1],L"icon")==0)programIcon(argv[2]);else if(argc==4&&wcscmp(argv[1],L"caret")==0){wchar_t* end=nullptr;const auto handle=wcstoull(argv[2],&end,10);wchar_t* pidEnd=nullptr;const auto pid=wcstoul(argv[3],&pidEnd,10);if(!handle||*end||!pid||*pidEnd)throw 1;caret(reinterpret_cast<HWND>(handle),pid);}else throw 1;}catch(...){result=1;}std::cout.flush();CoUninitialize();return result;}
