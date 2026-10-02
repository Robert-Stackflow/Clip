using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace ClipperSetup
{
    internal sealed class InstallerView
    {
        public readonly FrameworkElement Root;
        private readonly Window window;
        private bool chinese;
        private string state = "welcome";
        private string failure = "";
        private int errorCode;
        private CancellationTokenSource cancellation;
        private bool busy;
        private bool engineStarted;
        private bool closeAfterCancellation;

        public InstallerView(Window host, bool zh)
        {
            window = host; chinese = zh;
            using (Stream xaml = Assembly.GetExecutingAssembly().GetManifestResourceStream("Clipper.View.xaml"))
                Root = (FrameworkElement)XamlReader.Load(xaml);
            using (Stream icon = Assembly.GetExecutingAssembly().GetManifestResourceStream("Clipper.Icon.png"))
            {
                var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.StreamSource = icon; bitmap.EndInit(); bitmap.Freeze(); Find<Image>("Logo").Source = bitmap;
            }
            Find<Button>("LanguageButton").Click += delegate { chinese = !chinese; Refresh(); };
            Find<Button>("PrimaryButton").Click += delegate { if (state == "complete") Launch(); else if (!busy) StartInstallation(); };
            Find<Button>("SecondaryButton").Click += delegate { if (busy) cancellation.Cancel(); else if (window != null) window.Close(); };
            Find<Button>("LogButton").Click += delegate { try { Process.Start(new ProcessStartInfo(InstallerCore.LogPath) { UseShellExecute = true }); } catch (Exception e) { InstallerCore.Log(e.ToString()); } };
            Find<Button>("CloseButton").Click += delegate { RequestClose(); };
            Find<Button>("MinimizeButton").Click += delegate { if (window != null) window.WindowState = WindowState.Minimized; };
            if (window != null)
            {
                Find<Grid>("TitleBar").MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
                {
                    DependencyObject source = e.OriginalSource as DependencyObject;
                    while (source != null) { if (source is Button) return; source = VisualTreeHelper.GetParent(source); }
                    window.DragMove();
                };
                window.Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e)
                {
                    if (!busy) return;
                    e.Cancel = true; RequestClose();
                };
                window.PreviewKeyDown += delegate(object sender, KeyEventArgs e)
                { if (e.Key == Key.Escape) { RequestClose(); e.Handled = true; } };
            }
            Find<Image>("AppLogo").Source = Find<Image>("Logo").Source;
            Refresh();
        }

        private T Find<T>(string name) where T : FrameworkElement { return (T)Root.FindName(name); }
        private string L(string zh, string en) { return chinese ? zh : en; }
        private void Text(string name, string zh, string en) { Find<TextBlock>(name).Text = L(zh, en); }
        private void ButtonText(string name, string zh, string en)
        { var button = Find<Button>(name); button.Content = L(zh, en); AutomationProperties.SetName(button, L(zh, en)); }

        private void Refresh()
        {
            if (window != null) window.Title = L("Clipper 安装程序", "Clipper Setup");
            Text("HeaderLabel", "安装程序", "Setup");
            Find<TextBlock>("VersionLabel").Text = "v" + BuildInfo.Version;
            Text("PlatformLabel", "Windows 10 / 11\n64 位", "Windows 10 / 11\n64-bit");
            ButtonText("LanguageButton", "English", "简体中文");
            AutomationProperties.SetName(Find<Button>("CloseButton"), L("关闭", "Close"));
            AutomationProperties.SetName(Find<Button>("MinimizeButton"), L("最小化", "Minimize"));
            Text("LocationLabel", "安装位置", "Install location");
            Find<TextBlock>("LocationValue").Text = InstallerCore.InstallDirectory;
            Text("FooterTitle", "仅为当前用户安装", "Installed for your account");
            Text("FooterDescription", "重新安装与卸载会保留历史数据", "Your history is kept when reinstalling or uninstalling");
            ButtonText("LogButton", "查看安装日志 ↗", "View installation log ↗");
            Find<Button>("LanguageButton").IsEnabled = !busy;
            Find<Button>("PrimaryButton").IsEnabled = !busy;
            Find<Button>("SecondaryButton").IsEnabled = !engineStarted;
            Find<Border>("LocationPanel").Visibility = state == "welcome" || state == "complete" ? Visibility.Visible : Visibility.Collapsed;
            Find<StackPanel>("ProgressPanel").Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
            Find<Button>("LogButton").Visibility = state == "error" && failure != "running" ? Visibility.Visible : Visibility.Collapsed;
            if (state == "welcome")
            {
                Text("HeroTitle", "安装 Clipper", "Install Clipper");
                Text("HeroDescription", "安装到当前用户，完成后可从开始菜单打开。", "Install for your account. Open Clipper from the Start menu when finished.");
                ButtonText("PrimaryButton", "安装 Clipper", "Install Clipper");
                ButtonText("SecondaryButton", "取消", "Cancel");
            }
            else if (busy)
            {
                Text("HeroTitle", "正在安装", "Installing");
                Text("HeroDescription", "正在校验并写入程序文件。", "Verifying and installing application files.");
                ButtonText("PrimaryButton", "安装中…", "Installing…"); ButtonText("SecondaryButton", "取消", "Cancel");
            }
            else if (state == "complete")
            {
                Text("HeroTitle", "安装完成", "Installation complete");
                Text("HeroDescription", "Clipper 已添加到开始菜单。", "Clipper is now available in your Start menu.");
                ButtonText("PrimaryButton", "启动 Clipper", "Open Clipper"); ButtonText("SecondaryButton", "完成", "Finish");
            }
            else
            {
                Text("HeroTitle", failure == "running" ? "请先退出 Clipper" : "安装未完成", failure == "running" ? "Close Clipper to continue" : "Installation incomplete");
                Find<TextBlock>("HeroDescription").Text = FailureMessage(failure, errorCode);
                ButtonText("PrimaryButton", "重试", "Try again"); ButtonText("SecondaryButton", "关闭", "Close");
                if (failure == "unsupported" || failure == "newer" || failure == "integrity") Find<Button>("PrimaryButton").IsEnabled = false;
            }
        }

        private string FailureMessage(string reason, int code)
        {
            switch (reason)
            {
                case "running": return L("保存未完成的内容，在托盘菜单选择“退出”，然后点击重试。仅关闭窗口仍会驻留。", "Save unfinished work, choose Quit in Clipper’s tray menu, then try again. Closing its window leaves it running.");
                case "unsupported": return L("请在 64 位 Windows 10 或 Windows 11 上安装。", "Install on a 64-bit Windows 10 or Windows 11 PC.");
                case "newer": return L("电脑上已有更新版本，已停止安装。请使用已安装的 Clipper。", "A newer version is already installed. Use your installed copy of Clipper.");
                case "space": return L("安装磁盘需要至少 1 GB 可用空间。清理空间后重试。", "The installation drive needs at least 1 GB of free space. Free some space, then try again.");
                case "integrity": return L("安装包校验失败。请重新下载完整的安装器。", "The installer checksum did not match. Download a fresh copy of the installer.");
                case "installed-integrity": return L("安装后的文件校验未通过。请重试；历史数据仍然保留。", "Installed files could not be verified. Try again; your history is retained.");
                case "process-check": return L("无法确认 Clipper 是否正在运行。请查看日志，再重试。", "Could not check whether Clipper is running. View the log, then try again.");
                case "registration": return L("旧版安装信息不完整，已停止替换。请查看日志。", "The previous installation is incomplete. Replacement stopped. View the log.");
                case "restore": return L("安装未完成，旧版程序副本已保留。请查看日志中的备份位置。", "Installation did not finish. A copy of the previous program is retained. View the log for its location.");
                default: return L("安装遇到问题，历史数据未被删除。请查看日志并重试。错误码：", "Installation encountered a problem. Your history has not been deleted. View the log and try again. Error: ") + code;
            }
        }

        private void RequestClose()
        {
            if (busy)
            {
                if (!engineStarted) { closeAfterCancellation = true; cancellation.Cancel(); Text("ProgressLabel", "正在取消…", "Cancelling…"); }
                else Text("ProgressLabel", "请等待安装完成后关闭", "Please wait for installation to finish");
                return;
            }
            if (window != null) window.Close();
        }

        private async void StartInstallation()
        {
            busy = true; engineStarted = false; closeAfterCancellation = false; state = "progress"; cancellation = new CancellationTokenSource(); Refresh();
            var progress = new Progress<InstallProgress>(UpdateProgress);
            try
            {
                await Task.Run(() => InstallerCore.Install(value =>
                {
                    // Disable cancellation on the UI before starting the installation engine.
                    if (value.Stage == "installing" && window != null) window.Dispatcher.Invoke(new Action(() => UpdateProgress(value)));
                    else ((IProgress<InstallProgress>)progress).Report(value);
                }, cancellation.Token));
                state = "complete";
            }
            catch (OperationCanceledException) { state = "welcome"; }
            catch (InstallFailure e) { state = "error"; failure = e.Reason; errorCode = e.ExitCode; InstallerCore.Log(e.ToString()); }
            catch (Exception e) { state = "error"; failure = "engine"; errorCode = 1603; InstallerCore.Log(e.ToString()); }
            finally { busy = false; engineStarted = false; cancellation.Dispose(); cancellation = null; Refresh(); if (closeAfterCancellation && state == "welcome" && window != null) window.Close(); }
        }

        private void UpdateProgress(InstallProgress progress)
        {
            if (!busy) return;
            if (engineStarted && (progress.Stage == "extracting" || progress.Stage == "verifying" || progress.Stage == "backing-up")) return;
            ProgressBar bar = Find<ProgressBar>("InstallationProgress");
            bar.IsIndeterminate = progress.Stage != "extracting";
            bar.Value = progress.Percent;
            Find<TextBlock>("ProgressNumber").Text = progress.Stage == "extracting" ? ((int)progress.Percent).ToString() + "%" : "";
            if (progress.Stage == "extracting") Text("ProgressLabel", "正在准备安装文件", "Preparing installation files");
            else if (progress.Stage == "verifying") Text("ProgressLabel", "正在校验安装文件", "Verifying installation files");
            else if (progress.Stage == "backing-up") Text("ProgressLabel", "正在保留旧版程序文件", "Preserving the previous program");
            else if (progress.Stage == "installing")
            { engineStarted = true; Find<Button>("SecondaryButton").IsEnabled = false; Text("ProgressLabel", "正在写入程序文件", "Installing application files"); }
        }

        private void Launch()
        {
            try { Process.Start(new ProcessStartInfo(InstallerCore.InstalledExecutable) { UseShellExecute = true, WorkingDirectory = InstallerCore.InstallDirectory }); if (window != null) window.Close(); }
            catch (Exception e) { InstallerCore.Log(e.ToString()); Find<TextBlock>("HeroDescription").Text = L("暂时无法启动，请从开始菜单打开 Clipper。", "Could not launch right now. Open Clipper from your Start menu."); }
        }

        public void Preview(string requested)
        {
            state = requested; busy = requested == "progress"; engineStarted = false; failure = requested == "error" ? "running" : "";
            Refresh(); if (busy) UpdateProgress(new InstallProgress("extracting", 64));
        }

        public void VerifyView()
        {
            string initial = Find<TextBlock>("HeroTitle").Text;
            Find<Button>("LanguageButton").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            if (Find<TextBlock>("HeroTitle").Text == initial) throw new Exception("Language switch did not update the view");
            Preview("progress");
            if (Find<Button>("PrimaryButton").IsEnabled || Find<Button>("LanguageButton").IsEnabled) throw new Exception("Installation actions not locked");
            if (!Find<Button>("SecondaryButton").IsEnabled) throw new Exception("Extraction cannot be cancelled");
            if (Find<ProgressBar>("InstallationProgress").Value != 64 || Find<ProgressBar>("InstallationProgress").IsIndeterminate) throw new Exception("Extraction progress is not accurate");
            UpdateProgress(new InstallProgress("installing", 100));
            if (Find<Button>("SecondaryButton").IsEnabled || !Find<ProgressBar>("InstallationProgress").IsIndeterminate) throw new Exception("Engine state allows cancellation or claims a percentage");
            Preview("error");
            if (!Find<Button>("PrimaryButton").IsEnabled || Find<Button>("LogButton").Visibility != Visibility.Collapsed) throw new Exception("Running-app retry state invalid");
            Preview("complete");
            if (!Find<Button>("PrimaryButton").IsEnabled || !Find<Button>("SecondaryButton").IsEnabled) throw new Exception("Completion actions are not enabled");
        }
    }

    internal static class InstallerApp
    {
        [STAThread]
        public static int Main(string[] args)
        {
            try
            {
                if (args.Length == 2 && args[0] == "--render-preview")
                { RenderPreviews(Path.GetFullPath(args[1])); return 0; }
                if (args.Length == 2 && args[0] == "--verify-payload")
                { VerifyPayload(Path.GetFullPath(args[1])); return 0; }
                if (args.Length == 1 && args[0] == "--verify-install" && BuildInfo.Verification)
                { InstallerCore.Install(delegate { }, CancellationToken.None); return 0; }
                if (args.Length == 1 && args[0] == "--verify-recovery" && BuildInfo.Verification)
                { InstallerCore.Install(delegate { }, CancellationToken.None, true); return 0; }
                if (args.Length == 1 && args[0].Equals("/S", StringComparison.OrdinalIgnoreCase))
                { InstallerCore.Install(delegate { }, CancellationToken.None); return 0; }
                if (args.Length != 0) return 87;
                var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
                var window = new Window
                {
                    WindowStyle = WindowStyle.None, AllowsTransparency = true, Background = Brushes.Transparent,
                    ResizeMode = ResizeMode.NoResize, Width = Math.Min(840, SystemParameters.WorkArea.Width - 24),
                    Height = Math.Min(576, SystemParameters.WorkArea.Height - 24), WindowStartupLocation = WindowStartupLocation.CenterScreen
                };
                var view = new InstallerView(window, CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh");
                window.Content = new Viewbox { Stretch = Stretch.Uniform, Child = view.Root };
                using (Stream icon = Assembly.GetExecutingAssembly().GetManifestResourceStream("Clipper.Icon.png"))
                { var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.StreamSource = icon; bitmap.EndInit(); window.Icon = bitmap; }
                return app.Run(window);
            }
            catch (InstallFailure e) { InstallerCore.Log(e.ToString()); return e.ExitCode; }
            catch (Exception e) { InstallerCore.Log(e.ToString()); return 1603; }
        }

        private static void RenderPreviews(string folder)
        {
            Directory.CreateDirectory(folder);
            foreach (bool chinese in new[] { true, false }) new InstallerView(null, chinese).VerifyView();
            foreach (bool chinese in new[] { true, false })
            foreach (string state in new[] { "welcome", "progress", "complete", "error" })
            foreach (int scale in new[] { 100, 150, 200 })
            {
                var view = new InstallerView(null, chinese); view.Preview(state);
                view.Root.Measure(new Size(840, 576)); view.Root.Arrange(new Rect(0, 0, 840, 576)); view.Root.UpdateLayout();
                var bitmap = new RenderTargetBitmap(840 * scale / 100, 576 * scale / 100, 96 * scale / 100, 96 * scale / 100, PixelFormats.Pbgra32);
                bitmap.Render(view.Root); var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
                using (var file = File.Create(Path.Combine(folder, (chinese ? "zh" : "en") + "-" + state + "-" + scale + ".png"))) encoder.Save(file);
            }
            File.WriteAllText(Path.Combine(folder, "results.json"), "{\"actualWpfRender\":true,\"viewBehaviorPassed\":true,\"states\":4,\"languages\":2,\"scales\":[100,150,200],\"windowShown\":false,\"clipboardAccess\":false}");
        }

        private static void VerifyPayload(string result)
        {
            string folder = Path.Combine(Path.GetTempPath(), "ClipperSetup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            try
            {
                double previous = 0; int updates = 0;
                string file = InstallerCore.Extract(folder, delegate(InstallProgress p)
                {
                    if (p.Percent < previous || p.Percent > 100) throw new Exception("Invalid progress");
                    previous = p.Percent; updates++;
                }, CancellationToken.None);
                if (previous != 100 || updates < 2 || InstallerCore.Hash(file) != BuildInfo.PayloadSha256) throw new Exception("Payload verification failed");
                File.Delete(file);
                var cancellation = new CancellationTokenSource(); cancellation.Cancel();
                bool cancelled = false;
                try { InstallerCore.Extract(folder, delegate { }, cancellation.Token); } catch (OperationCanceledException) { cancelled = true; }
                cancellation.Dispose();
                if (!cancelled) throw new Exception("Cancellation was ignored");
                File.WriteAllText(result, "{\"passed\":true,\"embeddedPayloadSha256\":\"" + BuildInfo.PayloadSha256 + "\",\"payloadBytes\":" + BuildInfo.PayloadLength + ",\"progressMonotonic\":true,\"cancelBeforeInstall\":true,\"engineStarted\":false}");
            }
            finally { InstallerCore.CleanTemporary(folder); }
        }
    }
}
