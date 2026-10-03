#define NOMINMAX
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <psapi.h>
#include <iostream>
#include <vector>
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <fcntl.h>
#include <io.h>
#include <cstring>
using Microsoft::WRL::ComPtr;
static void check(HRESULT value){if(FAILED(value))throw std::runtime_error("PNG decode failed");}
struct PrivateBytes:std::vector<BYTE>{~PrivateBytes(){if(!empty())SecureZeroMemory(data(),size());}};
static uint32_t big(const BYTE* p){return (uint32_t(p[0])<<24)|(uint32_t(p[1])<<16)|(uint32_t(p[2])<<8)|p[3];}
static void validate(const PrivateBytes& bytes){
 const BYTE signature[]={137,80,78,71,13,10,26,10};if(bytes.size()<33||memcmp(bytes.data(),signature,8))throw std::runtime_error("PNG input invalid");
 uint32_t table[256];for(uint32_t n=0;n<256;n++){uint32_t c=n;for(int bit=0;bit<8;bit++)c=(c>>1)^((c&1)?0xedb88320:0);table[n]=c;}
 bool data=false,ended=false;for(size_t at=8;at<bytes.size();){if(bytes.size()-at<12||ended)throw std::runtime_error("PNG incomplete");const uint32_t length=big(bytes.data()+at);if(length>bytes.size()-at-12)throw std::runtime_error("PNG incomplete");const BYTE* type=bytes.data()+at+4;uint32_t crc=0xffffffff;for(size_t n=0;n<size_t(length)+4;n++)crc=table[(crc^type[n])&255]^(crc>>8);if((crc^0xffffffff)!=big(type+4+length))throw std::runtime_error("PNG checksum invalid");if(at==8&&(memcmp(type,"IHDR",4)||length!=13))throw std::runtime_error("PNG header invalid");if(!memcmp(type,"IDAT",4))data=true;if(!memcmp(type,"IEND",4)){if(length||!data)throw std::runtime_error("PNG end invalid");ended=true;}at+=size_t(length)+12;}if(!ended)throw std::runtime_error("PNG incomplete");
}
#include "ImageCmyk.h"
// In-memory images only: no filename, shell, metadata output or temporary file.
int main(int argc,char** argv){_setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);bool initialized=false;try{
 const bool jpeg=argc==2&&!std::strcmp(argv[1],"--jpeg");if(argc!=1&&!jpeg)throw std::runtime_error("Invalid image operation");
 check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));initialized=true;
 PrivateBytes input;input.reserve(65536);char block[65536];while(std::cin){std::cin.read(block,sizeof(block));const auto count=std::cin.gcount();if(input.size()+count>16*1024*1024){SecureZeroMemory(block,sizeof(block));throw std::runtime_error("PNG input too large");}input.insert(input.end(),block,block+count);SecureZeroMemory(block,sizeof(block));}
 if(!jpeg)validate(input);
 ComPtr<IWICImagingFactory> factory;check(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));
 ComPtr<IWICStream> stream;check(factory->CreateStream(&stream));check(stream->InitializeFromMemory(input.data(),static_cast<DWORD>(input.size())));
 ComPtr<IWICBitmapDecoder> decoder;check(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnDemand,&decoder));GUID format;check(decoder->GetContainerFormat(&format));if(format!=(jpeg?GUID_ContainerFormatJpeg:GUID_ContainerFormatPng))throw std::runtime_error("Image container invalid");
 ComPtr<IWICBitmapFrameDecode> original;check(decoder->GetFrame(0,&original));UINT width=0,height=0;check(original->GetSize(&width,&height));if(!width||!height||width>16384||height>16384||static_cast<uint64_t>(width)*height>40000000)throw std::runtime_error("PNG dimensions too large");
 ComPtr<IWICBitmapSource> source=original;GUID pixelFormat;check(original->GetPixelFormat(&pixelFormat));if(jpeg&&pixelFormat==GUID_WICPixelFormat32bppCMYK)source.Attach(new CmykSource(original.Get()));
 const double scale=jpeg?1.0:std::min({1.0,280.0/width,180.0/height});const UINT targetWidth=std::max(1U,static_cast<UINT>(std::round(width*scale))),targetHeight=std::max(1U,static_cast<UINT>(std::round(height*scale)));
 // Scale premultiplied alpha, then encode straight alpha to avoid dark edge fringes.
 ComPtr<IWICFormatConverter> premultiplied;check(factory->CreateFormatConverter(&premultiplied));check(premultiplied->Initialize(source.Get(),GUID_WICPixelFormat32bppPBGRA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));
 ComPtr<IWICBitmapScaler> scaler;check(factory->CreateBitmapScaler(&scaler));check(scaler->Initialize(premultiplied.Get(),targetWidth,targetHeight,WICBitmapInterpolationModeFant));
 ComPtr<IWICFormatConverter> straight;check(factory->CreateFormatConverter(&straight));check(straight->Initialize(scaler.Get(),GUID_WICPixelFormat32bppBGRA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));
 ComPtr<IStream> output;check(CreateStreamOnHGlobal(nullptr,TRUE,&output));ComPtr<IWICBitmapEncoder> encoder;check(factory->CreateEncoder(GUID_ContainerFormatPng,nullptr,&encoder));check(encoder->Initialize(output.Get(),WICBitmapEncoderNoCache));
 ComPtr<IWICBitmapFrameEncode> frame;ComPtr<IPropertyBag2> properties;check(encoder->CreateNewFrame(&frame,&properties));check(frame->Initialize(properties.Get()));check(frame->SetSize(targetWidth,targetHeight));GUID pixels=GUID_WICPixelFormat32bppBGRA;check(frame->SetPixelFormat(&pixels));if(pixels!=GUID_WICPixelFormat32bppBGRA)throw std::runtime_error("PNG pixel format failed");check(frame->WriteSource(straight.Get(),nullptr));check(frame->Commit());check(encoder->Commit());
 STATSTG state;check(output->Stat(&state,STATFLAG_NONAME));if(state.cbSize.QuadPart>(jpeg?16*1024*1024:1024*1024))throw std::runtime_error("PNG output too large");LARGE_INTEGER start{};check(output->Seek(start,STREAM_SEEK_SET,nullptr));PrivateBytes bytes;bytes.resize(static_cast<size_t>(state.cbSize.QuadPart));ULONG read=0;check(output->Read(bytes.data(),static_cast<ULONG>(bytes.size()),&read));if(read!=bytes.size())throw std::runtime_error("PNG output incomplete");std::cout.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());std::cout.flush();
 }catch(const std::exception& error){std::cerr<<error.what();if(initialized)CoUninitialize();return 1;}if(getenv("CLIPPER_IMAGE_METRICS")){PROCESS_MEMORY_COUNTERS memory{};if(GetProcessMemoryInfo(GetCurrentProcess(),&memory,sizeof(memory)))std::cerr<<"{\"peakWorkingSet\":"<<memory.PeakWorkingSetSize<<"}";}if(initialized)CoUninitialize();return 0;}
