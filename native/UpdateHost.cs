using System;
using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace ClipperUpdate
{
    // Runs from the download cache so replacement can remove every old program file.
    internal static class UpdateHost
    {
#if UPDATE_VERIFICATION
        const string Guid = Verification.Guid;
        const int ExitWait = 1500;
#else
        const string Guid = "b6d4d333-0ac3-5509-8b81-d6b57d4a4f1a";
        const int ExitWait = 60000;
#endif
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
#if UPDATE_VERIFICATION
        static readonly string Executable = Verification.Executable;
#else
        static readonly string Executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Clipper", "Clipper.exe");
#endif
        public sealed class Ticket { public int pid; public string executable; public string version; public string sha256; public string checkpointId; public string profileId; }
        static bool Same(string a, string b) { return String.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
        static bool Installed(string executable)
        {
            if (!Same(executable, Executable) || !File.Exists(Executable)) return false;
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + Guid))
            {
                string name = key == null ? "" : key.GetValue("DisplayName") as string;
                return key != null && (name == "Clipper" || (name != null && name.StartsWith("Clipper ", StringComparison.Ordinal)))
                    && File.Exists(Path.Combine(Path.GetDirectoryName(Executable), "resources", "app.asar"));
            }
        }
        static string Hash(Stream stream) { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
        static void Result(string folder, bool success, string version, string reason)
        {
            string file = Path.Combine(folder, "result.json");
            File.WriteAllText(file + ".tmp", Json.Serialize(new { success = success, version = version, reason = reason, time = DateTime.UtcNow.ToString("o") }), new UTF8Encoding(false));
            if (File.Exists(file)) File.Delete(file); File.Move(file + ".tmp", file);
        }
        static void Log(string folder, string value) { File.AppendAllText(Path.Combine(folder, "update.log"), DateTime.UtcNow.ToString("o") + " " + value + Environment.NewLine); }
        static void Restart() { if (File.Exists(Executable)) Process.Start(new ProcessStartInfo(Executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(Executable) }); }
        static string InstalledVersion() { using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + Guid)) return key == null ? "" : (string)key.GetValue("DisplayVersion"); }
        static string ProgramHash() { using (FileStream file = File.OpenRead(Path.Combine(Path.GetDirectoryName(Executable), "resources", "app.asar"))) return Hash(file); }
        static int Main(string[] args)
        {
            string folder = null, dataRoot = null; ProgramArchive archived = null; Ticket ticket = null; bool exited = false, trusted = false; string previousHash = "", previousVersion = "";
            try
            {
                if (args.Length == 2 && args[0] == "--probe")
                { Console.WriteLine(Installed(Encoding.UTF8.GetString(Convert.FromBase64String(args[1]))) ? "true" : "false"); return 0; }
                if (args.Length == 2 && args[0] == "--active")
                {
                    bool active = false;
                    try { string directory = Encoding.UTF8.GetString(Convert.FromBase64String(args[1])); int id = Int32.Parse(File.ReadAllText(Path.Combine(directory, "host.pid"))); using (Process host = Process.GetProcessById(id)) active = Same(host.MainModule.FileName, Path.Combine(directory, "UpdateHost.exe")) && !host.HasExited; }
                    catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { } catch (ArgumentException) { } catch (FormatException) { } catch { active = true; }
                    Console.WriteLine(active ? "true" : "false"); return 0;
                }
                if (args.Length != 1) return 2;
                string file = Path.GetFullPath(args[0]); folder = Path.GetDirectoryName(file);
                string own = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
                if (!Same(folder, own) || Path.GetFileName(file) != "handoff.json" || (File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0) throw new Exception("UPDATE_PATH_INVALID");
                trusted = true;
                ticket = Json.Deserialize<Ticket>(File.ReadAllText(file));
                if (ticket == null || !Installed(ticket.executable) || !System.Text.RegularExpressions.Regex.IsMatch(ticket.version ?? "", @"^\d+\.\d+\.\d+$") || !System.Text.RegularExpressions.Regex.IsMatch(ticket.sha256 ?? "", @"^[a-f0-9]{64}$")) throw new Exception("UPDATE_TICKET_INVALID");
                using (Process parent = Process.GetProcessById(ticket.pid))
                {
                    if (!Same(parent.MainModule.FileName, ticket.executable)) throw new Exception("UPDATE_PARENT_INVALID");
                    Console.WriteLine("ready"); Console.Out.Flush();
                    if (Console.ReadLine() != "install") return 3;
                    Console.WriteLine("armed"); Console.Out.Flush(); Console.Out.Close(); Console.In.Close(); Console.Error.Close();
                    if (!parent.WaitForExit(ExitWait)) throw new Exception("UPDATE_EXIT_TIMEOUT");
                }
                exited = true;
                previousHash = ProgramHash(); previousVersion = InstalledVersion();
                string updates = Path.GetDirectoryName(folder); dataRoot = Path.GetDirectoryName(updates);
                if (Path.GetFileName(updates) != "updates" || !Path.GetFileName(folder).StartsWith("download-", StringComparison.Ordinal)) throw new Exception("ROLLBACK_PATH");
                Log(folder, "Clipper exited. Validating the downloaded installer.");
                // Deny writes/deletion from validation until the installer has exited.
                using (FileStream installer = new FileStream(Path.Combine(folder, "installer.exe"), FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (Hash(installer) != ticket.sha256) throw new Exception("UPDATE_CHECKSUM");
                    Log(folder, "Installer checksum verified.");
                    string pending; archived = ProgramVersions.Capture(dataRoot, ticket.checkpointId, ticket.profileId, ticket.version, "update", out pending);
                    // Publish the verified old program before any installation mutation.
                    // A failed install removes it only after proving the original tree survived.
                    ProgramVersions.Publish(dataRoot, archived, pending);
                    using (Process engine = Process.Start(new ProcessStartInfo(Path.Combine(folder, "installer.exe"), "/S") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = folder }))
                    {
                        engine.WaitForExit(); Log(folder, "Installer returned " + engine.ExitCode + ".");
                        if (engine.ExitCode != 0) throw new Exception("UPDATE_INSTALL_" + engine.ExitCode);
                    }
                }
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + Guid))
                    if (!Installed(Executable) || key == null || (string)key.GetValue("DisplayVersion") != ticket.version) throw new Exception("UPDATE_INSTALLED_VERSION");
                ProgramVersions.Retain(dataRoot, ticket.profileId);
                Result(folder, true, ticket.version, ""); Restart(); return 0;
            }
            catch (Exception error)
            {
                if (trusted && folder != null && Directory.Exists(folder)) { try { Log(folder, error.ToString()); Result(folder, false, ticket == null ? "" : ticket.version, error.Message); } catch { } }
                if (exited) { try { if (previousHash.Length > 0 && Installed(Executable) && InstalledVersion() == previousVersion && ProgramHash() == previousHash) { if (archived != null) { ProgramVersions.VerifyTree(ProgramPaths.Install, archived.files); ProgramVersions.Remove(dataRoot, archived.id); } Restart(); } } catch { } }
                return 1;
            }
        }
    }
}
