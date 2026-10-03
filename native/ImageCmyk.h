// Preserve the existing JPEG codec's arithmetic CMYK conversion. WIC supplies
// normal CMYK samples; convert into the requested BGRA buffer without a second
// full-frame bitmap. Formula provenance and pixel comparisons are documented.
class CmykSource final:public IWICBitmapSource {
 LONG references=1;
 ComPtr<IWICBitmapSource> original;
 UINT width=0,height=0;
public:
 explicit CmykSource(IWICBitmapSource* value):original(value){check(original->GetSize(&width,&height));}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** value)override{
  if(!value)return E_POINTER;*value=nullptr;
  if(iid==IID_IUnknown||iid==IID_IWICBitmapSource){*value=static_cast<IWICBitmapSource*>(this);AddRef();return S_OK;}return E_NOINTERFACE;
 }
 ULONG STDMETHODCALLTYPE AddRef()override{return InterlockedIncrement(&references);}
 ULONG STDMETHODCALLTYPE Release()override{const auto count=InterlockedDecrement(&references);if(!count)delete this;return count;}
 HRESULT STDMETHODCALLTYPE GetSize(UINT* w,UINT* h)override{return original->GetSize(w,h);}
 HRESULT STDMETHODCALLTYPE GetPixelFormat(WICPixelFormatGUID* format)override{if(!format)return E_POINTER;*format=GUID_WICPixelFormat32bppBGRA;return S_OK;}
 HRESULT STDMETHODCALLTYPE GetResolution(double* x,double* y)override{return original->GetResolution(x,y);}
 HRESULT STDMETHODCALLTYPE CopyPalette(IWICPalette*)override{return WINCODEC_ERR_PALETTEUNAVAILABLE;}
 HRESULT STDMETHODCALLTYPE CopyPixels(const WICRect* requested,UINT stride,UINT capacity,BYTE* pixels)override{
  const WICRect rect=requested?*requested:WICRect{0,0,static_cast<INT>(width),static_cast<INT>(height)};
  if(!pixels||rect.X<0||rect.Y<0||rect.Width<=0||rect.Height<=0||static_cast<uint64_t>(rect.X)+rect.Width>width||static_cast<uint64_t>(rect.Y)+rect.Height>height||stride<static_cast<uint64_t>(rect.Width)*4||static_cast<uint64_t>(stride)*(rect.Height-1)+static_cast<uint64_t>(rect.Width)*4>capacity)return E_INVALIDARG;
  const auto result=original->CopyPixels(&rect,stride,capacity,pixels);if(FAILED(result))return result;
  for(INT y=0;y<rect.Height;y++)for(INT x=0;x<rect.Width;x++){
   BYTE* p=pixels+static_cast<size_t>(stride)*y+static_cast<size_t>(x)*4;
   const UINT c=255-p[0],m=255-p[1],yellow=255-p[2],k=255-p[3];
   p[0]=static_cast<BYTE>((yellow*k+127)/255);p[1]=static_cast<BYTE>((m*k+127)/255);p[2]=static_cast<BYTE>((c*k+127)/255);p[3]=255;
  }return S_OK;
 }
};
