using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Web.Script.Serialization;

// UI Automation may enter an unresponsive provider. This process is read-only;
// the Electron parent enforces a deadline and can terminate the entire worker.
internal static class SelectionHost {
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 public sealed class Request {public string id;public long hwnd;public int pid;public int x;public int y;public long allowedForeground;}
 public sealed class Box {public double x;public double y;public double width;public double height;}
 public sealed class Result {public string id;public string status;public string text;public List<Box> rects=new List<Box>();}
 const int Limit=32768;
 static bool ForegroundMatches(Request r){long current=GetForegroundWindow().ToInt64();return current==r.hwnd||(r.allowedForeground!=0&&current==r.allowedForeground);}
 static bool Belongs(AutomationElement element,Request r){if(element==null)return false;var current=element.Current;if(current.ProcessId!=r.pid)return false;int handle=current.NativeWindowHandle;return handle==0||GetAncestor(new IntPtr(handle),2).ToInt64()==r.hwnd;}
 static bool Protected(AutomationElement element){return element!=null&&element.Current.IsPassword;}
 static Result Read(Request r){
  var result=new Result{id=r.id,status="none"};uint pid;var hwnd=new IntPtr(r.hwnd);
  if(r.pid<=0||r.hwnd==0||!IsWindow(hwnd)||!ForegroundMatches(r)){result.status="stale";return result;}
  GetWindowThreadProcessId(hwnd,out pid);if(pid!=(uint)r.pid){result.status="stale";return result;}
  var focused=AutomationElement.FocusedElement;
  var point=AutomationElement.FromPoint(new Point(r.x,r.y));
  if((Belongs(focused,r)&&Protected(focused))||(Belongs(point,r)&&Protected(point))){result.status="protected";return result;}
  var candidates=new List<AutomationElement>();
  AddParents(candidates,point,r);AddParents(candidates,focused,r);
  candidates.Add(AutomationElement.FromHandle(hwnd));
  // Some providers place IsPassword on an ancestor rather than the leaf at the cursor.
  foreach(var element in candidates){if(Belongs(element,r)&&Protected(element)){result.status="protected";return result;}}
  bool supported=false;
  foreach(var element in candidates){
   try{if(!Belongs(element,r))continue;if(Protected(element)){result.status="protected";return result;}object pattern;
    if(!element.TryGetCurrentPattern(TextPattern.Pattern,out pattern))continue;supported=true;
    var ranges=((TextPattern)pattern).GetSelection();if(ranges==null||ranges.Length==0)continue;
    if(ranges.Length>16){result.status="large";return result;}
    var text=new StringBuilder();var rectangles=new List<Box>();
    foreach(var range in ranges){string part=range.GetText(Limit+1);if(string.IsNullOrEmpty(part))continue;if(text.Length>0)text.Append('\n');text.Append(part);if(text.Length>Limit){result.status="large";return result;}
     foreach(var rect in range.GetBoundingRectangles()){if(rectangles.Count>=64)break;if(!rect.IsEmpty&&!double.IsInfinity(rect.X)&&!double.IsInfinity(rect.Y)&&rect.Width>0&&rect.Height>0)rectangles.Add(new Box{x=rect.X,y=rect.Y,width=rect.Width,height=rect.Height});}
    }
    if(string.IsNullOrWhiteSpace(text.ToString()))continue;
    if(!ForegroundMatches(r)){result.status="stale";return result;}
    if(Belongs(AutomationElement.FocusedElement,r)&&Protected(AutomationElement.FocusedElement)){result.status="protected";return result;}
    result.status="ok";result.text=text.ToString();result.rects=rectangles;return result;
   }catch(ElementNotAvailableException){}catch(InvalidOperationException){}catch(COMException){}
  }
  result.status=supported?"none":"unsupported";return result;
 }
 static void AddParents(List<AutomationElement> result,AutomationElement element,Request r){for(int depth=0;element!=null&&depth<12;depth++){if(!Belongs(element,r))break;result.Add(element);if(element.Current.NativeWindowHandle==r.hwnd)break;element=TreeWalker.ControlViewWalker.GetParent(element);}}
 [MTAThread] static void Main(){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){}
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  var json=new JavaScriptSerializer{MaxJsonLength=262144};string line;
  while((line=Console.ReadLine())!=null){Request request=null;Result result;try{if(line.Length>4096)break;request=json.Deserialize<Request>(line);if(request==null||string.IsNullOrEmpty(request.id)||request.id.Length>80)break;result=Read(request);}catch{result=new Result{id=request==null?"":request.id,status="unavailable"};}
   Console.WriteLine(json.Serialize(result));Console.Out.Flush();
  }
 }
}
