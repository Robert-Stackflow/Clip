using System;
using System.IO;
using System.Windows.Forms;

internal sealed class PasteTarget : Form {
  private readonly string ready;
  private readonly string result;
  private readonly TextBox input = new TextBox { Dock = DockStyle.Fill, Multiline = true };

  internal PasteTarget(string ready, string result) {
    this.ready = ready;
    this.result = result;
    Text = "Clipper native paste target";
    Width = 600;
    Height = 300;
    Controls.Add(input);
    Shown += (sender, args) => { input.Focus(); File.WriteAllText(ready, Handle.ToInt64().ToString()); };
    input.TextChanged += (sender, args) => File.WriteAllText(result, input.Text);
  }

  [STAThread]
  private static void Main(string[] args) {
    Application.EnableVisualStyles();
    Application.Run(new PasteTarget(args[0], args[1]));
  }
}
