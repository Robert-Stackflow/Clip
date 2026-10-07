using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

// A short-lived recorder. It intercepts keys only while its caller owns the foreground.
class ShortcutHost {
 delegate IntPtr KeyboardProc(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] struct Keyboard {public uint key,scan,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x,y;public uint reserved;}
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,KeyboardProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flag);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern int GetMessage(out Message message,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
 [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message message);
 [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
 [DllImport("user32.dll")] static extern bool PeekMessage(out Message message,IntPtr hwnd,uint min,uint max,uint flags);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();
 static readonly HashSet<int> held=new HashSet<int>();
 static readonly KeyboardProc callback=Capture;
 static IntPtr target,hook;static uint thread;static int pending;static bool released;
 static bool Modifier(int key){return key==0x10||key==0x11||key==0x12||key==0x5b||key==0x5c||key>=0xa0&&key<=0xa5;}
 static bool Has(params int[] keys){foreach(int key in keys)if(held.Contains(key))return true;return false;}
 static string Key(int key){
  if(key>=0x41&&key<=0x5a||key>=0x30&&key<=0x39)return ((char)key).ToString();
  if(key>=0x70&&key<=0x87)return "F"+(key-0x6f);
  switch(key){case 0x20:return "Space";case 0x09:return "Tab";case 0x0d:return "Enter";case 0x1b:return "Escape";case 0x08:return "Backspace";case 0x2e:return "Delete";case 0x24:return "Home";case 0x23:return "End";case 0x21:return "PageUp";case 0x22:return "PageDown";case 0x26:return "ArrowUp";case 0x28:return "ArrowDown";case 0x25:return "ArrowLeft";case 0x27:return "ArrowRight";}return null;
 }
 static void Emit(int key,bool down){string name=Key(key);if(name==null)return;string code=key>=0x41&&key<=0x5a?"Key"+name:key>=0x30&&key<=0x39?"Digit"+name:name;
  Console.WriteLine(json.Serialize(new {type=down?"keyDown":"keyUp",key=name=="Space"?" ":name,code=code,control=Has(0x11,0xa2,0xa3),alt=Has(0x12,0xa4,0xa5),shift=Has(0x10,0xa0,0xa1),meta=Has(0x5b,0x5c)}));
 }
 static IntPtr Capture(int code,IntPtr message,IntPtr data){
  if(code<0)return CallNextHookEx(hook,code,message,data);
  if(GetAncestor(GetForegroundWindow(),2)!=target){PostThreadMessage(thread,0x12,UIntPtr.Zero,IntPtr.Zero);return CallNextHookEx(hook,code,message,data);}
  int msg=message.ToInt32();bool down=msg==0x100||msg==0x104,up=msg==0x101||msg==0x105;if(!down&&!up)return CallNextHookEx(hook,code,message,data);
  Keyboard input=(Keyboard)Marshal.PtrToStructure(data,typeof(Keyboard));int key=(int)input.key;
  if(Modifier(key)){if(down)held.Add(key);else held.Remove(key);}
  else if(key==9&&held.Count==0)return CallNextHookEx(hook,code,message,data); // Tab leaves the field.
  else if(down){if(pending!=key||released){pending=key;released=false;Emit(key,true);}}
  else if(key==pending)released=true;
  // Keep consuming modifiers until the whole chord is released, including Win's key-up.
  if(pending!=0&&released&&held.Count==0){Emit(pending,false);pending=0;released=false;}
  return new IntPtr(1);
 }
 static int Main(string[] args){
  uint parent;if(args.Length==2&&args[0]=="--win-v"&&uint.TryParse(args[1],out parent))return WinVShortcut.Run(parent);
  long hwnd;uint pid,owner;if(args.Length!=2||!long.TryParse(args[0],out hwnd)||!uint.TryParse(args[1],out pid))return 1;
  target=new IntPtr(hwnd);GetWindowThreadProcessId(target,out owner);if(owner!=pid||GetAncestor(GetForegroundWindow(),2)!=target)return 2;
  thread=GetCurrentThreadId();Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);
  foreach(int key in new int[]{0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0x5b,0x5c})if((GetAsyncKeyState(key)&0x8000)!=0)held.Add(key);
  hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)return 3;
  try{
   Thread reader=new Thread(delegate(){try{while(Console.ReadLine()!=null)break;}finally{PostThreadMessage(thread,0x12,UIntPtr.Zero,IntPtr.Zero);}});reader.IsBackground=true;reader.Start();
   Console.WriteLine("ready");while(GetMessage(out message,IntPtr.Zero,0,0)>0){TranslateMessage(ref message);DispatchMessage(ref message);}
  }finally{UnhookWindowsHookEx(hook);}return 0;
 }
}
