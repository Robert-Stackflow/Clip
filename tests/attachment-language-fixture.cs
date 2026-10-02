using System;
using System.Text;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
internal static class AttachmentLanguageFixture {
 [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags,UIntPtr size);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr handle);
 static Dictionary<string,object> Call(Type host,string method,params object[] args){try{object value=host.GetMethod(method,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,args);return new Dictionary<string,object>{{"ok",true},{"result",value is byte[]?Convert.ToBase64String((byte[])value):value}};}catch(TargetInvocationException e){Exception error=e.InnerException;FieldInfo code=error.GetType().GetField("Code");return new Dictionary<string,object>{{"ok",false},{"error",error.Message},{"code",code==null?null:code.GetValue(error)}};}}
 static void Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);Type host=Assembly.LoadFrom(args[0]).GetType("AttachmentHost");var output=new List<object>();foreach(string name in new[]{"资料\\保留.txt","",new string('x',260),"CON.txt",string.Join("\\",new string('x',17).ToCharArray())})output.Add(Call(host,"ValidatePath",name));IntPtr handle=GlobalAlloc(0x42,(UIntPtr)32);try{IntPtr address=GlobalLock(handle);byte[] bytes=Encoding.UTF8.GetBytes("raw 保存");Marshal.Copy(bytes,0,address,bytes.Length);GlobalUnlock(handle);output.Add(Call(host,"GlobalBytes",handle,32,(ulong)bytes.Length));output.Add(Call(host,"GlobalBytes",handle,32,(ulong)100000));output.Add(Call(host,"GlobalBytes",handle,1,(ulong)bytes.Length));}finally{GlobalFree(handle);}Console.WriteLine(new JavaScriptSerializer().Serialize(output));}
}
