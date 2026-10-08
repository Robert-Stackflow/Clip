using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

// Runs on its own message-loop thread. Only the exact Win+V chord is consumed.
class WinVShortcut {
 delegate IntPtr KeyboardProc(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] struct Keyboard {public uint key,scan,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x,y;public uint reserved;}
 [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit,Size=40)] struct Input {[FieldOffset(0)] public uint type;[FieldOffset(8)] public KeyboardInput keyboard;}
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,KeyboardProc callback,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint pid);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,Input[] inputs,int size);
 [DllImport("user32.dll")] static extern int GetMessage(out Message message,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
 [DllImport("user32.dll")] static extern bool PeekMessage(out Message message,IntPtr hwnd,uint min,uint max,uint flags);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 const uint Command=0x8001,Pressed=0x8002;
 static readonly UIntPtr Marker=new UIntPtr(0x43565756);
 static readonly HashSet<int> held=new HashSet<int>();
 static readonly KeyboardProc callback=Capture;
 static IntPtr hook,target;static uint thread,parent,targetPid;static bool enabled,consumed,vReleased;
 static bool Has(params int[] keys){foreach(int key in keys)if(held.Contains(key))return true;return false;}
 static IntPtr Capture(int code,IntPtr message,IntPtr data){
  if(code<0)return CallNextHookEx(hook,code,message,data);
  Keyboard input=(Keyboard)Marshal.PtrToStructure(data,typeof(Keyboard));
  if(input.extra==Marker)return CallNextHookEx(hook,code,message,data);
  int msg=message.ToInt32(),key=(int)input.key;bool down=msg==0x100||msg==0x104,up=msg==0x101||msg==0x105;
  if(!down&&!up)return CallNextHookEx(hook,code,message,data);
  if(key==0x5b||key==0x5c||key>=0xa0&&key<=0xa5||key>=0x10&&key<=0x12){if(down)held.Add(key);else held.Remove(key);}
  bool block=false;
  if(key==0x56){
   if(consumed){block=true;if(up)vReleased=true;}
   else if(enabled&&down&&Has(0x5b,0x5c)&&!Has(0x10,0x11,0x12,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5)){
    target=GetForegroundWindow();GetWindowThreadProcessId(target,out targetPid);consumed=true;vReleased=false;block=true;
   }
  }
  if(consumed&&up&&(key==0x5b||key==0x5c)){
   // Replace this release with a harmless key followed by the real Win release.
   // The order also works when a whole chord arrived in one SendInput batch.
   block=true;
   Input[] mask=new Input[]{new Input{type=1,keyboard=new KeyboardInput{key=0xe8,extra=Marker}},new Input{type=1,keyboard=new KeyboardInput{key=0xe8,flags=2,extra=Marker}},new Input{type=1,keyboard=new KeyboardInput{key=(ushort)key,flags=2,extra=Marker}}};
   // If Windows rejects injection (for example across integrity levels), let
   // the original release through rather than leaving a Win modifier held.
   block=SendInput(3,mask,40)==3;
  }
  // Dispatch after release: the receiving app sees no held Win modifier.
  if(consumed&&vReleased&&!Has(0x5b,0x5c)){
   consumed=false;vReleased=false;if(enabled)PostThreadMessage(thread,Pressed,UIntPtr.Zero,IntPtr.Zero);
  }
  return block?new IntPtr(1):CallNextHookEx(hook,code,message,data);
 }
 public static int Run(uint pid){
  parent=pid;
  bool created;using(Mutex mutex=new Mutex(true,"Local\\Clip.WinVShortcut",out created)){
   if(!created)return 4;
   try{
    thread=GetCurrentThreadId();Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);
    foreach(int key in new int[]{0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0x5b,0x5c})if((GetAsyncKeyState(key)&0x8000)!=0)held.Add(key);
    hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)return 3;
    try{
     Thread reader=new Thread(delegate(){try{string line;while((line=Console.ReadLine())!=null){if(line=="stop")break;if(line=="enable"||line=="disable")PostThreadMessage(thread,Command,new UIntPtr(line=="enable"?1u:0u),IntPtr.Zero);}}finally{PostThreadMessage(thread,0x12,UIntPtr.Zero,IntPtr.Zero);}});reader.IsBackground=true;reader.Start();
     Console.WriteLine("ready");
     while(GetMessage(out message,IntPtr.Zero,0,0)>0){
      if(message.message==Command){enabled=message.wParam.ToUInt32()==1;if(enabled){held.Clear();foreach(int key in new int[]{0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0x5b,0x5c})if((GetAsyncKeyState(key)&0x8000)!=0)held.Add(key);}Console.WriteLine(enabled?"enabled":"disabled");}
      else if(message.message==Pressed&&enabled){AllowSetForegroundWindow(parent);Console.WriteLine("pressed "+target.ToInt64()+" "+targetPid);}
     }
    }finally{enabled=false;UnhookWindowsHookEx(hook);}
   }finally{mutex.ReleaseMutex();}
  }
  return 0;
 }
}
