using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using Microsoft.Win32;
using System.Collections.Generic;

namespace ClipperSetup
{
    internal sealed class InstallFailure : Exception
    {
        public readonly string Reason;
        public readonly int ExitCode;
        public InstallFailure(string reason, int code) : base(reason) { Reason = reason; ExitCode = code; }
    }

    internal sealed class InstallProgress
    {
        public string Stage;
        public double Percent;
        public InstallProgress(string stage, double percent) { Stage = stage; Percent = percent; }
    }

    internal static class InstallerCore
    {
        public static readonly string InstallDirectory = BuildInfo.InstallDirectory.Length == 0
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Clipper")
            : BuildInfo.InstallDirectory;
        public static readonly string InstalledExecutable = Path.Combine(InstallDirectory, BuildInfo.ProductName + ".exe");
        public static readonly string LogPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ClipperInstaller", "Logs", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N") + ".log");

        public static void Log(string message)
        {
            try { Directory.CreateDirectory(Path.GetDirectoryName(LogPath)); File.AppendAllText(LogPath, DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine); }
            catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        private static void CheckEnvironment()
        {
            if (!Environment.Is64BitOperatingSystem || Environment.OSVersion.Version.Major < 10)
                throw new InstallFailure("unsupported", 1633);
            try
            {
                Process[] running = Process.GetProcessesByName(BuildInfo.ProductName);
                try { if (running.Length > 0) throw new InstallFailure("running", 1602); }
                finally { foreach (Process p in running) p.Dispose(); }
            }
            catch (InstallFailure) { throw; }
            catch (Exception e) { Log(e.ToString()); throw new InstallFailure("process-check", 1603); }
            if (File.Exists(InstalledExecutable))
            {
                Version installed, current;
                // Read the version from this installer's own registration.
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + BuildInfo.NsisGuid))
                {
                    string version = key == null ? null : key.GetValue("DisplayVersion") as string;
                    if (Version.TryParse(version, out installed) && Version.TryParse(BuildInfo.Version, out current)
                        && Normalize(installed) > Normalize(current)) throw new InstallFailure("newer", 1638);
                }
            }
            DriveInfo drive = new DriveInfo(Path.GetPathRoot(InstallDirectory));
            if (drive.AvailableFreeSpace < 1024L * 1024 * 1024) throw new InstallFailure("space", 112);
        }

        private static Version Normalize(Version version)
        { return new Version(version.Major, version.Minor, Math.Max(0, version.Build), Math.Max(0, version.Revision)); }

        private sealed class ProgramBackup
        {
            public readonly string Folder;
            private readonly Dictionary<string, Dictionary<string, Tuple<object, RegistryValueKind>>> registry = new Dictionary<string, Dictionary<string, Tuple<object, RegistryValueKind>>>();
            private readonly string shortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "Windows", "Start Menu", "Programs", BuildInfo.ProductName + ".lnk");
            private readonly bool hadShortcut;
            public ProgramBackup(string scratch, CancellationToken cancellation)
            {
                Folder = Path.Combine(scratch, "previous-app");
                CopyTree(InstallDirectory, Folder, cancellation);
                foreach (string keyName in new[] { "Software\\" + BuildInfo.NsisGuid, "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + BuildInfo.NsisGuid })
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(keyName))
                {
                    if (key == null) throw new InstallFailure("registration", 1603);
                    var values = new Dictionary<string, Tuple<object, RegistryValueKind>>();
                    foreach (string value in key.GetValueNames()) values.Add(value, Tuple.Create(key.GetValue(value, null, RegistryValueOptions.DoNotExpandEnvironmentNames), key.GetValueKind(value)));
                    registry.Add(keyName, values);
                }
                hadShortcut = File.Exists(shortcut);
                if (hadShortcut) File.Copy(shortcut, Path.Combine(scratch, "previous-shortcut.lnk"));
            }

            public void Restore()
            {
                CopyTree(Folder, InstallDirectory, CancellationToken.None);
                foreach (var saved in registry)
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(saved.Key))
                    foreach (var value in saved.Value) key.SetValue(value.Key, value.Value.Item1, value.Value.Item2);
                if (hadShortcut) { Directory.CreateDirectory(Path.GetDirectoryName(shortcut)); File.Copy(Path.Combine(Path.GetDirectoryName(Folder), "previous-shortcut.lnk"), shortcut, true); }
                Log("Previous program files, own installation registration and Start menu entry restored.");
            }
        }

        private static void CopyTree(string source, string destination, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            if ((File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked program folders cannot be backed up safely.");
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                cancellation.ThrowIfCancellationRequested();
                if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked program files cannot be backed up safely.");
                File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
            }
            foreach (string folder in Directory.GetDirectories(source)) CopyTree(folder, Path.Combine(destination, Path.GetFileName(folder)), cancellation);
        }

        private static void RemovePrevious(string scratch)
        {
            string original = Path.Combine(InstallDirectory, "Uninstall " + BuildInfo.ProductName + ".exe");
            if (!File.Exists(original)) throw new InstallFailure("registration", 1603);
            string copy = Path.Combine(scratch, "Previous-Uninstall.exe");
            File.Copy(original, copy);
            // Run the existing engine normally, retaining user data. Passing _?=
            // to the temporary copy keeps this a single process that we can await.
            var start = new ProcessStartInfo(copy, "/S /KEEP_APP_DATA /currentuser _?=" + InstallDirectory)
                { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = scratch };
            start.EnvironmentVariables["TEMP"] = scratch; start.EnvironmentVariables["TMP"] = scratch;
            using (Process uninstall = Process.Start(start))
            {
                uninstall.WaitForExit(); Log("Previous uninstallation engine returned " + uninstall.ExitCode + ".");
                if (uninstall.ExitCode == 1602) throw new InstallFailure("running", 1602);
                if (uninstall.ExitCode != 0) throw new InstallFailure("engine", uninstall.ExitCode);
            }
            using (RegistryKey remaining = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + BuildInfo.NsisGuid))
                if (remaining != null || File.Exists(InstalledExecutable)) throw new InstallFailure("engine", 1603);
        }

        internal static string Extract(string folder, Action<InstallProgress> report, CancellationToken cancellation)
        {
            string target = Path.Combine(folder, "Clipper-Install-Engine.exe");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Clipper.Payload"))
            {
                if (resource == null || resource.Length != BuildInfo.PayloadLength) throw new InstallFailure("integrity", 13);
                using (FileStream file = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    byte[] buffer = new byte[256 * 1024];
                    long total = 0; int read;
                    while ((read = resource.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        file.Write(buffer, 0, read); total += read;
                        report(new InstallProgress("extracting", total * 100.0 / resource.Length));
                    }
                    file.Flush(true);
                }
            }
            cancellation.ThrowIfCancellationRequested();
            report(new InstallProgress("verifying", 100));
            if (!String.Equals(Hash(target), BuildInfo.PayloadSha256, StringComparison.OrdinalIgnoreCase))
                throw new InstallFailure("integrity", 13);
            cancellation.ThrowIfCancellationRequested();
            return target;
        }

        internal static string Hash(string file)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream stream = File.OpenRead(file))
                return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }

        // Only removes the exact random folder this process created. No app data is touched.
        internal static void CleanTemporary(string folder)
        {
            string parent = Path.GetDirectoryName(folder).TrimEnd('\\');
            string name = Path.GetFileName(folder);
            bool ownedSystemTemporary = parent.Equals(Path.GetTempPath().TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)
                && name.StartsWith("ClipperSetup-", StringComparison.Ordinal);
            bool ownedInstallTemporary = parent.Equals(Path.GetDirectoryName(InstallDirectory).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)
                && name.Length == 19 && name.StartsWith("cs-", StringComparison.Ordinal);
            if (ownedSystemTemporary || ownedInstallTemporary)
            {
                try { Directory.Delete(folder, true); }
                catch (IOException e) { Log("Temporary cleanup: " + e.Message); }
                catch (UnauthorizedAccessException e) { Log("Temporary cleanup: " + e.Message); }
            }
        }

        public static void Install(Action<InstallProgress> report, CancellationToken cancellation, bool verifyRecovery = false)
        {
            // Keep the engine's scratch directory on the installation volume so NSIS
            // can atomically rename old files even if its uninstaller maps their icons.
            string parent = Path.GetDirectoryName(InstallDirectory);
            string folder = Path.Combine(parent, "cs-" + Guid.NewGuid().ToString("N").Substring(0, 16));
            Log("Clipper " + BuildInfo.Version + " installation started.");
            CheckEnvironment();
            Directory.CreateDirectory(parent);
            Directory.CreateDirectory(folder);
            ProgramBackup backup = null;
            bool changedPrevious = false, retainBackup = false;
            try
            {
                string payload = Extract(folder, report, cancellation);
                if (File.Exists(InstalledExecutable))
                {
                    report(new InstallProgress("backing-up", 100));
                    backup = new ProgramBackup(folder, cancellation);
                }
                cancellation.ThrowIfCancellationRequested();
                // No cancellation or force termination is allowed after the engine starts.
                report(new InstallProgress("installing", 100));
                cancellation.ThrowIfCancellationRequested();
                if (backup != null)
                {
                    changedPrevious = true;
                    RemovePrevious(folder);
                    if (verifyRecovery && BuildInfo.Verification) throw new InstallFailure("engine", 1612);
                }
                var start = new ProcessStartInfo(payload, "/S /currentuser /D=" + InstallDirectory)
                    { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = folder };
                start.EnvironmentVariables["TEMP"] = folder;
                start.EnvironmentVariables["TMP"] = folder;
                using (Process installer = Process.Start(start))
                {
                    installer.WaitForExit();
                    Log("Installation engine returned " + installer.ExitCode + ".");
                    if (installer.ExitCode == 1602) throw new InstallFailure("running", 1602);
                    if (installer.ExitCode != 0) throw new InstallFailure("engine", installer.ExitCode);
                }
                if (!File.Exists(InstalledExecutable)
                    || !File.Exists(Path.Combine(InstallDirectory, "resources", "app.asar"))
                    || !String.Equals(Hash(Path.Combine(InstallDirectory, "resources", "app.asar")), BuildInfo.AsarSha256, StringComparison.OrdinalIgnoreCase))
                    throw new InstallFailure("installed-integrity", 13);
                report(new InstallProgress("complete", 100));
                Log("Installation and installed application checksum verified.");
            }
            catch (Exception e)
            {
                Log(e.ToString());
                var known = e as InstallFailure;
                if (changedPrevious && backup != null && (known == null || known.Reason != "running"))
                {
                    try { backup.Restore(); }
                    catch (Exception restore)
                    { retainBackup = true; Log("Restoration failed. Previous program backup retained at " + backup.Folder + ". " + restore); throw new InstallFailure("restore", 1603); }
                }
                throw;
            }
            finally { if (!retainBackup) CleanTemporary(folder); }
        }
    }
}
