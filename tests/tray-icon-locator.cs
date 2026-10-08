using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Automation;
class TrayIconLocator {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 static object Entry(AutomationElement e){var b=e.Current.BoundingRectangle;return new {name=e.Current.Name,x=b.X,y=b.Y,width=b.Width,height=b.Height,offscreen=e.Current.IsOffscreen};}
 [STAThread] static void Main(){Console.OutputEncoding=new System.Text.UTF8Encoding(false);var icons=new List<object>();var expand=new List<object>();var names=new List<string>();
  foreach(var cls in new[]{"Shell_TrayWnd","NotifyIconOverflowWindow","TopLevelWindowForOverflowXamlIsland","Xaml_WindowedPopupClass"}){var hwnd=FindWindow(cls,null);if(hwnd==IntPtr.Zero||!IsWindowVisible(hwnd))continue;try{var root=AutomationElement.FromHandle(hwnd);var nodes=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);names.Add(cls+":"+nodes.Count);foreach(AutomationElement e in nodes){var name=(e.Current.Name??"").Trim();if(name=="Clip"){icons.Add(Entry(e));}else if(name=="显示隐藏的图标"||name=="Show hidden icons"||name=="隐藏的图标菜单"||name=="Hidden icon menu"){expand.Add(Entry(e));}if(name.Contains("隐藏")||name.Contains("hidden")||name.Contains("Clip"))names.Add(name+":"+e.Current.ControlType.ProgrammaticName);}}catch(ElementNotAvailableException){} }
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{icons,expand,hints=names}));
 }
}
