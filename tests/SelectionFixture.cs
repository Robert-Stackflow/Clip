using System;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
internal static class SelectionFixture {
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [StructLayout(LayoutKind.Explicit,Size=40)] struct INPUT{[FieldOffset(0)] public uint type;[FieldOffset(20)]public uint flags;}
 static Form form;static RichTextBox rich;static TextBox password;static JavaScriptSerializer json=new JavaScriptSerializer();
 static void Report(object result){Console.WriteLine(json.Serialize(result));Console.Out.Flush();}
 static void Select(string mode){form.TopMost=true;form.Show();form.Activate();SetForegroundWindow(form.Handle);Control control=mode=="password"?(Control)password:rich;var point=control.PointToScreen(new Point(50,10));SetCursorPos(point.X,point.Y);SendInput(2,new INPUT[]{new INPUT{flags=2},new INPUT{flags=4}},40);control.Focus();
 var timer=new System.Windows.Forms.Timer{Interval=120};timer.Tick+=(s,e)=>{timer.Stop();timer.Dispose();if(mode=="password")password.SelectAll();else{rich.Text=mode=="large"?new string('x',32769):"Native 文字选区\n第二行 sample";rich.Select(0,mode=="empty"?0:rich.TextLength);}Report(new{mode=mode,hwnd=form.Handle.ToInt64(),pid=System.Diagnostics.Process.GetCurrentProcess().Id,x=point.X,y=point.Y});};timer.Start();
 }
 [STAThread]static void Main(){try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);Application.EnableVisualStyles();form=new Form{Text="Clipper 原生选区验收",StartPosition=FormStartPosition.Manual,Location=new Point(100,120),ClientSize=new Size(680,360)};rich=new RichTextBox{Location=new Point(20,20),Size=new Size(620,210),Font=new Font("Segoe UI",18),HideSelection=false};password=new TextBox{Location=new Point(20,260),Size=new Size(620,40),UseSystemPasswordChar=true,Text="protected-native-fixture"};form.Controls.Add(rich);form.Controls.Add(password);form.Shown+=(s,e)=>{Report(new{ready=true});var thread=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){var command=line;form.BeginInvoke(new Action(()=>{if(command=="exit")form.Close();else Select(command);}));if(command=="exit")return;}try{form.BeginInvoke(new Action(()=>form.Close()));}catch{}});thread.IsBackground=true;thread.Start();};Application.Run(form);}
}
