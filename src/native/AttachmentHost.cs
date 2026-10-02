using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using STATSTG=System.Runtime.InteropServices.ComTypes.STATSTG;
using System.Web.Script.Serialization;

[ComVisible(true), Guid("0000000A-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IBoundedLockBytes {
 void ReadAt(ulong offset,IntPtr buffer,uint count,IntPtr read);
 void WriteAt(ulong offset,IntPtr buffer,uint count,IntPtr written);
 void Flush(); void SetSize(ulong length);
 void LockRegion(ulong offset,ulong count,uint type); void UnlockRegion(ulong offset,ulong count,uint type);
 void Stat(out STATSTG stat,uint flags);
}
[ComImport,Guid("0000000B-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAttachmentStorage {
 void CreateStream([MarshalAs(UnmanagedType.LPWStr)]string name,uint mode,uint reserved1,uint reserved2,out IStream stream);
 void OpenStream([MarshalAs(UnmanagedType.LPWStr)]string name,IntPtr reserved,uint mode,uint reserved2,out IStream stream);
 void CreateStorage([MarshalAs(UnmanagedType.LPWStr)]string name,uint mode,uint reserved1,uint reserved2,out IAttachmentStorage storage);
 void OpenStorage([MarshalAs(UnmanagedType.LPWStr)]string name,IAttachmentStorage priority,uint mode,IntPtr exclude,uint reserved,out IAttachmentStorage storage);
 void CopyTo(uint count,IntPtr excludeIids,IntPtr excludeNames,IAttachmentStorage destination);
 void MoveElementTo([MarshalAs(UnmanagedType.LPWStr)]string name,IAttachmentStorage destination,[MarshalAs(UnmanagedType.LPWStr)]string newName,uint flags);
 void Commit(uint flags); void Revert();
 void EnumElements(uint reserved1,IntPtr reserved2,uint reserved3,out IntPtr enumerator);
 void DestroyElement([MarshalAs(UnmanagedType.LPWStr)]string name);
 void RenameElement([MarshalAs(UnmanagedType.LPWStr)]string oldName,[MarshalAs(UnmanagedType.LPWStr)]string newName);
 void SetElementTimes([MarshalAs(UnmanagedType.LPWStr)]string name,IntPtr created,IntPtr accessed,IntPtr modified);
 void SetClass(ref Guid clsid); void SetStateBits(uint bits,uint mask); void Stat(out STATSTG stat,uint flags);
}
[ComVisible(true),ClassInterface(ClassInterfaceType.None)]
public sealed class BoundedAttachmentBytes:IBoundedLockBytes {
 readonly int limit;readonly MemoryStream data=new MemoryStream();public BoundedAttachmentBytes(int maximum){limit=maximum;}
 public byte[] Bytes(){return data.ToArray();}
 public void ReadAt(ulong offset,IntPtr buffer,uint count,IntPtr read){if(offset>(ulong)data.Length){if(read!=IntPtr.Zero)Marshal.WriteInt32(read,0);return;}int n=(int)Math.Min((ulong)count,(ulong)data.Length-offset);data.Position=(long)offset;var bytes=new byte[n];data.Read(bytes,0,n);Marshal.Copy(bytes,0,buffer,n);if(read!=IntPtr.Zero)Marshal.WriteInt32(read,n);}
 public void WriteAt(ulong offset,IntPtr buffer,uint count,IntPtr written){if(offset>(ulong)limit||count>(ulong)limit-offset)throw new COMException("Attachment capacity exceeded",unchecked((int)0x80030070));var bytes=new byte[(int)count];Marshal.Copy(buffer,bytes,0,(int)count);data.Position=(long)offset;data.Write(bytes,0,bytes.Length);if(written!=IntPtr.Zero)Marshal.WriteInt32(written,(int)count);}
 public void Flush(){} public void SetSize(ulong size){if(size>(ulong)limit)throw new COMException("Attachment capacity exceeded",unchecked((int)0x80030070));data.SetLength((long)size);}
 public void LockRegion(ulong offset,ulong count,uint type){} public void UnlockRegion(ulong offset,ulong count,uint type){}
 public void Stat(out STATSTG stat,uint flags){stat=new STATSTG();stat.type=3;stat.cbSize=data.Length;}
}
internal static class AttachmentHost {
 [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
 [DllImport("ole32.dll")] static extern void OleUninitialize();
 [DllImport("ole32.dll")] static extern int OleGetClipboard(out System.Runtime.InteropServices.ComTypes.IDataObject value);
 [DllImport("ole32.dll")] static extern void ReleaseStgMedium(ref STGMEDIUM value);
 [DllImport("ole32.dll")] public static extern int StgCreateDocfileOnILockBytes(IBoundedLockBytes bytes,uint mode,uint reserved,out IAttachmentStorage storage);
 [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string value);
 [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint format);
 [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
 const int Maximum=12*1024*1024;
 sealed class Request {public uint sequence;}
 sealed class Descriptor {public bool directory;public string name;public ulong? size;public long? created;public long? accessed;public long? modified;public uint? attributes;}
 static FORMATETC Format(string name,int index,TYMED medium){return new FORMATETC{cfFormat=unchecked((short)RegisterClipboardFormat(name)),dwAspect=DVASPECT.DVASPECT_CONTENT,lindex=index,ptd=IntPtr.Zero,tymed=medium};}
 static byte[] GlobalBytes(IntPtr handle,int maximum,ulong? declared=null){ulong allocated=GlobalSize(handle).ToUInt64(),length=declared??allocated;if(length>allocated)throw new Exception("附件内容短于声明长度");if(length>(ulong)maximum)throw new Exception("附件超过容量限制");if(length==0)return new byte[0];IntPtr address=GlobalLock(handle);if(address==IntPtr.Zero)throw new Exception("无法读取附件内存");try{var bytes=new byte[(int)length];Marshal.Copy(address,bytes,0,bytes.Length);return bytes;}finally{GlobalUnlock(handle);}}
 static long? Time(byte[] bytes,int offset){long value=BitConverter.ToInt64(bytes,offset);if(value<=0)return null;try{long milliseconds=(DateTime.FromFileTimeUtc(value).Ticks-new DateTime(1970,1,1).Ticks)/10000;return milliseconds>=0?(long?)milliseconds:null;}catch{return null;}}
 static bool Private(System.Runtime.InteropServices.ComTypes.IDataObject data){foreach(string name in new[]{"ExcludeClipboardContentFromMonitorProcessing","Clipboard Viewer Ignore","org.nspasteboard.ConcealedType"})if(IsClipboardFormatAvailable(RegisterClipboardFormat(name)))return true;var f=Format("CanIncludeInClipboardHistory",-1,TYMED.TYMED_HGLOBAL);if(data.QueryGetData(ref f)!=0)return false;STGMEDIUM medium;data.GetData(ref f,out medium);try{if(medium.tymed!=TYMED.TYMED_HGLOBAL)return true;var bytes=GlobalBytes(medium.unionmember,64);return bytes.Length<4||BitConverter.ToUInt32(bytes,0)==0;}finally{ReleaseStgMedium(ref medium);}}
 static void Current(uint sequence,System.Runtime.InteropServices.ComTypes.IDataObject data){if(GetClipboardSequenceNumber()!=sequence)throw new Exception("剪贴板已改变");if(Private(data))throw new Exception("此剪贴板内容不允许记录");}
 static List<Descriptor> Descriptors(System.Runtime.InteropServices.ComTypes.IDataObject data){bool wide=true;var format=Format("FileGroupDescriptorW",-1,TYMED.TYMED_HGLOBAL);if(data.QueryGetData(ref format)!=0){wide=false;format=Format("FileGroupDescriptor",-1,TYMED.TYMED_HGLOBAL);if(data.QueryGetData(ref format)!=0)throw new Exception("未找到虚拟附件");}STGMEDIUM medium;data.GetData(ref format,out medium);byte[] bytes;try{if(medium.tymed!=TYMED.TYMED_HGLOBAL)throw new Exception("附件描述格式不支持");bytes=GlobalBytes(medium.unionmember,256*592+8);}finally{ReleaseStgMedium(ref medium);}if(bytes.Length<4)throw new Exception("附件描述不完整");uint count=BitConverter.ToUInt32(bytes,0);int stride=wide?592:332;if(count<1||count>256||bytes.Length<4+count*stride)throw new Exception("附件数量或描述无效");var result=new List<Descriptor>();var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);ulong total=0;
  for(int i=0;i<(int)count;i++){int at=4+i*stride;uint flags=BitConverter.ToUInt32(bytes,at);string raw=wide?Encoding.Unicode.GetString(bytes,at+72,520):Encoding.Default.GetString(bytes,at+72,260);if(raw.IndexOf('\0')<0)throw new Exception("附件文件名未终止");string name=raw.Split('\0')[0];ValidatePath(name);if(!names.Add(name))throw new Exception("附件文件名重复");var d=new Descriptor{name=name};if((flags&4)!=0){d.attributes=BitConverter.ToUInt32(bytes,at+36);if((d.attributes.Value&0x440)!=0)throw new Exception("附件不支持链接或设备属性");d.directory=(d.attributes.Value&0x10)!=0;}if((flags&8)!=0)d.created=Time(bytes,at+40);if((flags&16)!=0)d.accessed=Time(bytes,at+48);if((flags&32)!=0)d.modified=Time(bytes,at+56);if((flags&64)!=0){d.size=((ulong)BitConverter.ToUInt32(bytes,at+64)<<32)|BitConverter.ToUInt32(bytes,at+68);if(d.directory&&d.size.Value!=0)throw new Exception("文件夹不能声明文件内容");if(d.size.Value>Maximum||total+d.size.Value>Maximum)throw new Exception("附件总量超过 12 MiB");total+=d.size.Value;}result.Add(d);}
  var tree=new Dictionary<string,Descriptor>(StringComparer.OrdinalIgnoreCase);foreach(var d in result)tree.Add(d.name,d);foreach(var d in result){var parts=d.name.Split('\\');for(int n=1;n<parts.Length;n++){string parent=string.Join("\\",parts,0,n);Descriptor existing;if(tree.TryGetValue(parent,out existing)){if(!existing.directory||existing.name!=parent)throw new Exception("附件父目录无效或大小写冲突");}else{tree.Add(parent,new Descriptor{name=parent,directory=true});if(tree.Count>256)throw new Exception("附件及父目录超过 256 项");}}}return result;
 }
 static void ValidatePath(string name){if(string.IsNullOrEmpty(name)||name.Length>259)throw new Exception("附件文件名无效或过长");var parts=name.Split('\\');if(parts.Length>16)throw new Exception("附件目录超过 16 层");foreach(string part in parts){if(string.IsNullOrWhiteSpace(part)||part.Length>255||part=="."||part==".."||part.IndexOfAny(Path.GetInvalidFileNameChars())>=0||part.IndexOf((char)127)>=0||part.EndsWith(".")||part.EndsWith(" ")||char.IsWhiteSpace(part[0])||System.Text.RegularExpressions.Regex.IsMatch(part,@"^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM[1-9¹²³]|LPT[1-9¹²³])([ .]|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception("附件文件名无效");}}
 static byte[] Contents(System.Runtime.InteropServices.ComTypes.IDataObject data,int index,Descriptor descriptor,int remaining){var f=Format("FileContents",index,TYMED.TYMED_HGLOBAL|TYMED.TYMED_ISTREAM|TYMED.TYMED_ISTORAGE);STGMEDIUM medium;data.GetData(ref f,out medium);try{byte[] result;
  if(medium.tymed==TYMED.TYMED_HGLOBAL){result=GlobalBytes(medium.unionmember,remaining,descriptor.size);}
  else if(medium.tymed==TYMED.TYMED_ISTREAM){var stream=(IStream)Marshal.GetObjectForIUnknown(medium.unionmember);try{var output=new MemoryStream();var buffer=new byte[65536];IntPtr read=Marshal.AllocHGlobal(4);try{while(true){Marshal.WriteInt32(read,0);stream.Read(buffer,buffer.Length,read);int length=Marshal.ReadInt32(read);if(length<0||length>buffer.Length||output.Length+length>remaining)throw new Exception("附件超过容量限制");if(length==0)break;output.Write(buffer,0,length);}result=output.ToArray();}finally{Marshal.FreeHGlobal(read);}}finally{Marshal.ReleaseComObject(stream);}if(descriptor.size.HasValue&&(ulong)result.Length!=descriptor.size.Value)throw new Exception("附件内容与声明长度不一致");}
  else if(medium.tymed==TYMED.TYMED_ISTORAGE){var source=(IAttachmentStorage)Marshal.GetObjectForIUnknown(medium.unionmember);var bounded=new BoundedAttachmentBytes(remaining);IAttachmentStorage target=null;try{Marshal.ThrowExceptionForHR(StgCreateDocfileOnILockBytes(bounded,0x1012,0,out target));source.CopyTo(0,IntPtr.Zero,IntPtr.Zero,target);target.Commit(0);result=bounded.Bytes();}finally{if(target!=null)Marshal.ReleaseComObject(target);Marshal.ReleaseComObject(source);}}
  else throw new Exception("附件内容介质不支持");return result;
 }finally{ReleaseStgMedium(ref medium);}}
 [STAThread] static void Main(){Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);var json=new JavaScriptSerializer{MaxJsonLength=18*1024*1024};bool initialized=false;System.Runtime.InteropServices.ComTypes.IDataObject data=null;try{string line=Console.ReadLine();if(line==null||line.Length>4096)throw new Exception("附件请求无效");var request=json.Deserialize<Request>(line);if(request==null||request.sequence==0)throw new Exception("附件请求无效");Marshal.ThrowExceptionForHR(OleInitialize(IntPtr.Zero));initialized=true;Marshal.ThrowExceptionForHR(OleGetClipboard(out data));Current(request.sequence,data);var descriptors=Descriptors(data);var attachments=new List<Dictionary<string,object>>();int total=0;for(int i=0;i<descriptors.Count;i++){Current(request.sequence,data);var d=descriptors[i];var content=d.directory?new byte[0]:Contents(data,i,d,Maximum-total);total+=content.Length;var item=new Dictionary<string,object>{{"name",d.name},{"data",Convert.ToBase64String(content)}};if(d.directory)item["directory"]=true;if(d.created.HasValue)item["created"]=d.created.Value;if(d.accessed.HasValue)item["accessed"]=d.accessed.Value;if(d.modified.HasValue)item["modified"]=d.modified.Value;if(d.attributes.HasValue)item["attributes"]=d.attributes.Value;attachments.Add(item);}Current(request.sequence,data);Console.WriteLine(json.Serialize(new {attachments=attachments}));}catch(Exception e){Console.WriteLine(json.Serialize(new {error=e is COMException?"目标应用无法提供附件内容":e.Message}));Environment.ExitCode=1;}finally{if(data!=null)Marshal.ReleaseComObject(data);if(initialized)OleUninitialize();}}
}
