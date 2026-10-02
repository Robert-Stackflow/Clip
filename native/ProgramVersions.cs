using System;
using System.IO;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace ClipperUpdate
{
    internal static class ProgramPaths
    {
#if UPDATE_VERIFICATION
        internal const string Identity = Verification.Guid;
        internal static readonly string Executable = Verification.Executable;
        internal const int ExitWait = 1500;
        internal static readonly string Product = "ClipperVerification-" + Identity;
        internal static readonly string RecoveryRunKey = "Software\\ClipperVerification\\" + Identity + "\\RunOnce";
#else
        internal const string Identity = "b6d4d333-0ac3-5509-8b81-d6b57d4a4f1a";
        internal static readonly string Executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Clipper", "Clipper.exe");
        internal const int ExitWait = 60000;
        internal const string Product = "Clipper";
        internal const string RecoveryRunKey = "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
#endif
        internal static readonly string Install = Path.GetDirectoryName(Executable);
        internal static readonly string Shortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "Windows", "Start Menu", "Programs", Product + ".lnk");
        internal static readonly string[] Keys = { "Software\\" + Identity, "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + Identity };
        internal static bool Same(string a, string b) { return String.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
        internal static void DirectorySafe(string directory)
        {
            string full = Path.GetFullPath(directory);
            if (full.Length < 3 || full[1] != ':' || full[2] != '\\') throw new Exception("ROLLBACK_PATH");
            for (string p = full; p != null; p = Path.GetDirectoryName(p))
                if (Directory.Exists(p) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) throw new Exception("ROLLBACK_PATH");
            if (!Directory.Exists(full)) throw new Exception("ROLLBACK_PATH");
        }
        internal static void FileSafe(string file)
        {
            DirectorySafe(Path.GetDirectoryName(file));
            if (!File.Exists(file) || (File.GetAttributes(file) & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != 0) throw new Exception("ROLLBACK_FILE");
        }
        internal static string Hash(string file)
        {
            FileSafe(file);
            using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        internal static bool Id(string value) { Guid id; return value != null && Guid.TryParseExact(value, "D", out id) && id.ToString("D") == value; }
        internal static bool Version(string value) { return value != null && System.Text.RegularExpressions.Regex.IsMatch(value, @"^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$"); }
        internal static bool Digest(string value) { return value != null && System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-f0-9]{64}$"); }
        internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024, RecursionLimit = 64 };
        internal static T Read<T>(string file, long limit)
        { FileSafe(file); if (new FileInfo(file).Length > limit) throw new Exception("ROLLBACK_FILE"); return Json.Deserialize<T>(File.ReadAllText(file, Encoding.UTF8)); }
        internal static void Atomic(string file, string value)
        { AtomicBytes(file, Encoding.UTF8.GetBytes(value)); }
        internal static void AtomicBytes(string file, byte[] data)
        {
            DirectorySafe(Path.GetDirectoryName(file));
            string temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (FileStream stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(data, 0, data.Length); stream.Flush(true); }
                if (File.Exists(file)) { FileSafe(file); File.Replace(temp, file, null); } else File.Move(temp, file);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        internal static void RecoveryEntry(string executable, bool remove)
        {
            string name = "ClipperRecovery-" + Identity, command = "\"" + Path.GetFullPath(executable) + "\" --recover";
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RecoveryRunKey))
            {
                string old = key.GetValue(name) as string;
                if (old != null && old != command) throw new Exception("ROLLBACK_RECOVERY_ACTIVE");
                if (remove) key.DeleteValue(name, false); else key.SetValue(name, command, RegistryValueKind.String);
            }
        }
    }
    public sealed class VersionFile { public long bytes; public string sha256; }
    public sealed class RegistryValue { public int kind; public string value; public string[] multiple; }
    public sealed class RegistryTree { public Dictionary<string, Dictionary<string, RegistryValue>> nodes; }
    public sealed class ProgramArchive
    {
        public string format; public int formatVersion; public string id; public string version; public string installedTo; public long createdAt; public long bytes;
        public string checkpointId; public string profileId; public string checkpointSha256; public string reason;
        public Dictionary<string, VersionFile> files; public RegistryTree[] registry; public bool shortcut; public VersionFile shortcutFile;
    }
    public sealed class ArchiveCheckpoint { public string format; public int version; public string id; public string profileId; public string sourceVersion; public string targetVersion; public int schema; public bool encrypted; public Dictionary<string, VersionFile> files; }
    internal static class ProgramVersions
    {
        static string Root(string dataRoot) { ProgramPaths.DirectorySafe(dataRoot); string root = Path.Combine(dataRoot, "program-versions"); Directory.CreateDirectory(root); ProgramPaths.DirectorySafe(root); return root; }
        static string Leaf(string dataRoot, string id) { if (!ProgramPaths.Id(id)) throw new Exception("ROLLBACK_ID"); string leaf = Path.Combine(Root(dataRoot), id); ProgramPaths.DirectorySafe(leaf); return leaf; }
        internal static string Relative(string value)
        {
            if (String.IsNullOrEmpty(value) || value.Length > 230 || value.Contains("/") || value.Contains(":")) throw new Exception("ROLLBACK_PATH");
            foreach (string component in value.Split('\\'))
                if (component.Length == 0 || component == "." || component == ".." || component.EndsWith(".") || component.EndsWith(" ")) throw new Exception("ROLLBACK_PATH");
            return value;
        }
        static void Walk(string root, string current, Dictionary<string, VersionFile> files, ref long total, int depth)
        {
            if (depth > 16) throw new Exception("ROLLBACK_CAPACITY"); ProgramPaths.DirectorySafe(current);
            foreach (string file in Directory.GetFiles(current))
            {
                ProgramPaths.FileSafe(file); string relative = Relative(file.Substring(root.Length + 1)); long size = new FileInfo(file).Length;
                if (size > 1024L * 1024 * 1024 || files.Count >= 4096 || total + size > 2L * 1024 * 1024 * 1024) throw new Exception("ROLLBACK_CAPACITY");
                files.Add(relative, new VersionFile { bytes = size, sha256 = ProgramPaths.Hash(file) }); total += size;
            }
            foreach (string directory in Directory.GetDirectories(current)) Walk(root, directory, files, ref total, depth + 1);
        }
        internal static Dictionary<string, VersionFile> Tree(string folder, out long bytes)
        { var files = new Dictionary<string, VersionFile>(StringComparer.OrdinalIgnoreCase); bytes = 0; Walk(Path.GetFullPath(folder).TrimEnd('\\'), Path.GetFullPath(folder).TrimEnd('\\'), files, ref bytes, 0); return files; }
        internal static void VerifyTree(string folder, Dictionary<string, VersionFile> expected)
        {
            if (expected == null || expected.Count == 0 || expected.Count > 4096) throw new Exception("ROLLBACK_MANIFEST");
            long bytes; var actual = Tree(folder, out bytes); if (actual.Count != expected.Count) throw new Exception("ROLLBACK_CHANGED");
            var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var file in expected)
            {
                Relative(file.Key); VersionFile found;
                if (!unique.Add(file.Key) || file.Value == null || file.Value.bytes < 0 || !ProgramPaths.Digest(file.Value.sha256) || !actual.TryGetValue(file.Key, out found) || found.bytes != file.Value.bytes || found.sha256 != file.Value.sha256) throw new Exception("ROLLBACK_CHANGED");
            }
        }
        internal static void CopyTree(string source, string destination)
        {
            ProgramPaths.DirectorySafe(source); Directory.CreateDirectory(destination); ProgramPaths.DirectorySafe(destination);
            foreach (string file in Directory.GetFiles(source)) { ProgramPaths.FileSafe(file); string target = Path.Combine(destination, Path.GetFileName(file)); if (File.Exists(target)) ProgramPaths.FileSafe(target); File.Copy(file, target, true); }
            foreach (string directory in Directory.GetDirectories(source)) CopyTree(directory, Path.Combine(destination, Path.GetFileName(directory)));
        }
        static RegistryValue Value(RegistryKey key, string name)
        {
            RegistryValueKind kind = key.GetValueKind(name); object value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
            var saved = new RegistryValue { kind = (int)kind };
            if (kind == RegistryValueKind.Binary || kind == RegistryValueKind.None) saved.value = Convert.ToBase64String((byte[])value);
            else if (kind == RegistryValueKind.MultiString) saved.multiple = (string[])value;
            else saved.value = Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
            return saved;
        }
        static void ReadNode(RegistryKey key, string path, RegistryTree tree, int depth)
        {
            if (depth > 16 || tree.nodes.Count > 512) throw new Exception("ROLLBACK_REGISTRY"); var values = new Dictionary<string, RegistryValue>();
            foreach (string name in key.GetValueNames()) { if (values.Count > 1024) throw new Exception("ROLLBACK_REGISTRY"); values.Add(name, Value(key, name)); }
            tree.nodes.Add(path, values); foreach (string name in key.GetSubKeyNames()) using (RegistryKey child = key.OpenSubKey(name)) ReadNode(child, path.Length == 0 ? name : path + "\\" + name, tree, depth + 1);
        }
        internal static RegistryTree[] CaptureRegistry()
        {
            var result = new RegistryTree[2];
            for (int i = 0; i < 2; i++) using (RegistryKey key = Registry.CurrentUser.OpenSubKey(ProgramPaths.Keys[i]))
            { if (key == null) throw new Exception("ROLLBACK_REGISTRATION"); result[i] = new RegistryTree { nodes = new Dictionary<string, Dictionary<string, RegistryValue>>() }; ReadNode(key, "", result[i], 0); }
            return result;
        }
        internal static void ValidateRegistry(RegistryTree[] trees)
        {
            if (trees == null || trees.Length != 2) throw new Exception("ROLLBACK_REGISTRY");
            foreach (RegistryTree tree in trees)
            {
                if (tree == null || tree.nodes == null || !tree.nodes.ContainsKey("") || tree.nodes.Count > 512) throw new Exception("ROLLBACK_REGISTRY");
                foreach (var node in tree.nodes)
                {
                    if (node.Key != "") Relative(node.Key); if (node.Value == null || node.Value.Count > 1024) throw new Exception("ROLLBACK_REGISTRY");
                    foreach (var pair in node.Value)
                    {
                        RegistryValue value = pair.Value; if (pair.Key.Length > 16384 || value == null) throw new Exception("ROLLBACK_REGISTRY");
                        var kind = (RegistryValueKind)value.kind;
                        if (kind == RegistryValueKind.MultiString) { if (value.multiple == null || value.multiple.Length > 1024) throw new Exception("ROLLBACK_REGISTRY"); foreach (string s in value.multiple) if (s == null || s.Length > 32768) throw new Exception("ROLLBACK_REGISTRY"); }
                        else { if (value.value == null || value.value.Length > 131072) throw new Exception("ROLLBACK_REGISTRY"); if (kind == RegistryValueKind.Binary || kind == RegistryValueKind.None) Convert.FromBase64String(value.value); else if (kind == RegistryValueKind.DWord) Int32.Parse(value.value); else if (kind == RegistryValueKind.QWord) Int64.Parse(value.value); else if (kind != RegistryValueKind.String && kind != RegistryValueKind.ExpandString) throw new Exception("ROLLBACK_REGISTRY"); }
                    }
                }
            }
        }
        internal static void RestoreRegistry(RegistryTree[] trees)
        {
            ValidateRegistry(trees);
            for (int i = 0; i < 2; i++)
            {
                Registry.CurrentUser.DeleteSubKeyTree(ProgramPaths.Keys[i], false);
                foreach (var node in trees[i].nodes) using (RegistryKey key = Registry.CurrentUser.CreateSubKey(ProgramPaths.Keys[i] + (node.Key.Length == 0 ? "" : "\\" + node.Key)))
                foreach (var pair in node.Value)
                {
                    var kind = (RegistryValueKind)pair.Value.kind; object value;
                    if (kind == RegistryValueKind.MultiString) value = pair.Value.multiple;
                    else if (kind == RegistryValueKind.Binary || kind == RegistryValueKind.None) value = Convert.FromBase64String(pair.Value.value);
                    else if (kind == RegistryValueKind.DWord) value = Int32.Parse(pair.Value.value);
                    else if (kind == RegistryValueKind.QWord) value = Int64.Parse(pair.Value.value);
                    else value = pair.Value.value;
                    key.SetValue(pair.Key, value, kind);
                }
            }
        }
        internal static string InstalledVersion()
        { using (RegistryKey key = Registry.CurrentUser.OpenSubKey(ProgramPaths.Keys[1])) return key == null ? "" : key.GetValue("DisplayVersion") as string; }
        internal static bool Installed(string executable)
        {
            if (!ProgramPaths.Same(executable, ProgramPaths.Executable) || !File.Exists(ProgramPaths.Executable)) return false;
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(ProgramPaths.Keys[1]))
            { string name = key == null ? "" : key.GetValue("DisplayName") as string; return key != null && (name == "Clipper" || name != null && name.StartsWith("Clipper ", StringComparison.Ordinal)) && File.Exists(Path.Combine(ProgramPaths.Install, "resources", "app.asar")); }
        }
        internal static ArchiveCheckpoint Checkpoint(string dataRoot, string checkpointId, string profileId, string version)
        {
            if (!ProgramPaths.Id(checkpointId) || !ProgramPaths.Id(profileId)) throw new Exception("ROLLBACK_CHECKPOINT");
            string dir = Path.Combine(dataRoot, "history-checkpoints", checkpointId); ProgramPaths.DirectorySafe(dir);
            var point = ProgramPaths.Read<ArchiveCheckpoint>(Path.Combine(dir, "checkpoint.json"), 16384);
            if (point == null || point.format != "clipper-history-checkpoint" || point.version != 1 || point.id != checkpointId || point.profileId != profileId || point.sourceVersion != version || point.schema < 0 || point.files == null || !point.files.ContainsKey("history.sqlite") || point.encrypted != point.files.ContainsKey("history-vault.json")) throw new Exception("ROLLBACK_CHECKPOINT");
            if (Directory.GetDirectories(dir).Length != 0 || Directory.GetFiles(dir).Length != point.files.Count + 1) throw new Exception("ROLLBACK_CHECKPOINT");
            foreach (var file in point.files)
            { if (file.Key != "history.sqlite" && file.Key != "history-vault.json") throw new Exception("ROLLBACK_CHECKPOINT"); var value = file.Value; string full = Path.Combine(dir, file.Key); if (value == null || value.bytes < 1 || value.bytes > 512L * 1024 * 1024 || !ProgramPaths.Digest(value.sha256) || new FileInfo(full).Length != value.bytes || ProgramPaths.Hash(full) != value.sha256) throw new Exception("ROLLBACK_CHECKPOINT"); }
            return point;
        }
        internal static ProgramArchive Capture(string dataRoot, string checkpointId, string profileId, string installedTo, string reason, out string pending)
        {
            string version = InstalledVersion(); if (!Installed(ProgramPaths.Executable) || !ProgramPaths.Version(version) || !ProgramPaths.Version(installedTo)) throw new Exception("ROLLBACK_REGISTRATION");
            Checkpoint(dataRoot, checkpointId, profileId, version); long bytes; var original = Tree(ProgramPaths.Install, out bytes);
            DriveInfo drive = new DriveInfo(Path.GetPathRoot(dataRoot)); if (drive.AvailableFreeSpace < bytes + 128L * 1024 * 1024) throw new Exception("ROLLBACK_SPACE");
            string id = Guid.NewGuid().ToString("D"); pending = Path.Combine(Root(dataRoot), ".pending-" + id); Directory.CreateDirectory(pending);
            CopyTree(ProgramPaths.Install, Path.Combine(pending, "program")); VerifyTree(Path.Combine(pending, "program"), original);
            bool shortcut = File.Exists(ProgramPaths.Shortcut); if (shortcut) { ProgramPaths.FileSafe(ProgramPaths.Shortcut); File.Copy(ProgramPaths.Shortcut, Path.Combine(pending, "shortcut.lnk")); }
            var archive = new ProgramArchive { format = "clipper-program-version", formatVersion = 1, id = id, version = version, installedTo = installedTo, createdAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds, bytes = bytes, checkpointId = checkpointId, profileId = profileId, checkpointSha256 = ProgramPaths.Hash(Path.Combine(dataRoot, "history-checkpoints", checkpointId, "checkpoint.json")), reason = reason, files = original, registry = CaptureRegistry(), shortcut = shortcut, shortcutFile = shortcut ? new VersionFile { bytes = new FileInfo(Path.Combine(pending, "shortcut.lnk")).Length, sha256 = ProgramPaths.Hash(Path.Combine(pending, "shortcut.lnk")) } : null };
            ProgramPaths.Atomic(Path.Combine(pending, "archive.json"), ProgramPaths.Json.Serialize(archive)); return archive;
        }
        internal static void Publish(string dataRoot, ProgramArchive archive, string pending)
        { if (!ProgramPaths.Same(pending, Path.Combine(Root(dataRoot), ".pending-" + archive.id))) throw new Exception("ROLLBACK_PATH"); Directory.Move(pending, Path.Combine(Root(dataRoot), archive.id)); }
        internal static ProgramArchive Read(string dataRoot, string id, bool verify)
        {
            string leaf = Leaf(dataRoot, id); ProgramArchive value = ProgramPaths.Read<ProgramArchive>(Path.Combine(leaf, "archive.json"), 4 * 1024 * 1024);
            if (value == null || value.format != "clipper-program-version" || value.formatVersion != 1 || value.id != id || !ProgramPaths.Version(value.version) || !ProgramPaths.Version(value.installedTo) || value.createdAt <= 0 || value.bytes < 1 || value.bytes > 2L * 1024 * 1024 * 1024 || !ProgramPaths.Id(value.checkpointId) || !ProgramPaths.Id(value.profileId) || !ProgramPaths.Digest(value.checkpointSha256) || value.reason != "update" && value.reason != "rollback") throw new Exception("ROLLBACK_MANIFEST");
            ValidateRegistry(value.registry); RegistryValue registeredVersion; if (!value.registry[1].nodes[""].TryGetValue("DisplayVersion", out registeredVersion) || registeredVersion.value != value.version) throw new Exception("ROLLBACK_REGISTRATION"); long total = 0; if (value.files == null || value.files.Count > 4096) throw new Exception("ROLLBACK_MANIFEST"); foreach (var file in value.files) { Relative(file.Key); if (file.Value == null || file.Value.bytes < 0 || !ProgramPaths.Digest(file.Value.sha256)) throw new Exception("ROLLBACK_MANIFEST"); total += file.Value.bytes; } if (total != value.bytes || !value.files.ContainsKey(Path.GetFileName(ProgramPaths.Executable)) || !value.files.ContainsKey("resources\\app.asar")) throw new Exception("ROLLBACK_MANIFEST");
            if (Directory.GetDirectories(leaf).Length != 1 || !Directory.Exists(Path.Combine(leaf, "program")) || Directory.GetFiles(leaf).Length != (value.shortcut ? 2 : 1) || value.shortcut && !File.Exists(Path.Combine(leaf, "shortcut.lnk"))) throw new Exception("ROLLBACK_CHANGED");
            if (value.shortcut) { string shortcut = Path.Combine(leaf, "shortcut.lnk"); ProgramPaths.FileSafe(shortcut); if (value.shortcutFile == null || value.shortcutFile.bytes < 1 || value.shortcutFile.bytes > 1024 * 1024 || !ProgramPaths.Digest(value.shortcutFile.sha256) || new FileInfo(shortcut).Length != value.shortcutFile.bytes || ProgramPaths.Hash(shortcut) != value.shortcutFile.sha256) throw new Exception("ROLLBACK_CHANGED"); }
            if (verify) { VerifyTree(Path.Combine(leaf, "program"), value.files); Checkpoint(dataRoot, value.checkpointId, value.profileId, value.version); if (ProgramPaths.Hash(Path.Combine(dataRoot, "history-checkpoints", value.checkpointId, "checkpoint.json")) != value.checkpointSha256) throw new Exception("ROLLBACK_CHECKPOINT"); }
            return value;
        }
        internal static List<ProgramArchive> List(string dataRoot)
        {
            var values = new List<ProgramArchive>(); foreach (string directory in Directory.GetDirectories(Root(dataRoot))) if (ProgramPaths.Id(Path.GetFileName(directory))) try { values.Add(Read(dataRoot, Path.GetFileName(directory), false)); } catch { }
            values.Sort((a, b) => b.createdAt.CompareTo(a.createdAt)); return values;
        }
        internal static string Program(string dataRoot, string id) { return Path.Combine(Leaf(dataRoot, id), "program"); }
        internal static void Shortcut(string dataRoot, ProgramArchive archive)
        { if (archive.shortcut) { Directory.CreateDirectory(Path.GetDirectoryName(ProgramPaths.Shortcut)); if (File.Exists(ProgramPaths.Shortcut)) ProgramPaths.FileSafe(ProgramPaths.Shortcut); File.Copy(Path.Combine(Leaf(dataRoot, archive.id), "shortcut.lnk"), ProgramPaths.Shortcut, true); } else if (File.Exists(ProgramPaths.Shortcut)) { ProgramPaths.FileSafe(ProgramPaths.Shortcut); File.Delete(ProgramPaths.Shortcut); } }
        // Remove only a fully verified owned archive, using its exact file tree.
        internal static void Remove(string dataRoot, string id)
        {
            ProgramArchive archive = Read(dataRoot, id, true); string leaf = Leaf(dataRoot, id),program = Path.Combine(leaf, "program");
            foreach (string file in archive.files.Keys) File.Delete(Path.Combine(program, file)); RemoveEmpty(program);
            if (archive.shortcut) File.Delete(Path.Combine(leaf, "shortcut.lnk")); File.Delete(Path.Combine(leaf, "archive.json")); Directory.Delete(leaf, false);
        }
        internal static void RemoveEmpty(string directory) { ProgramPaths.DirectorySafe(directory); foreach (string child in Directory.GetDirectories(directory)) RemoveEmpty(child); Directory.Delete(directory, false); }
        internal static void Retain(string dataRoot, string profileId, string protectedId = null)
        { var values = List(dataRoot); if (protectedId != null) values.Sort((a,b) => a.id == protectedId ? -1 : b.id == protectedId ? 1 : b.createdAt.CompareTo(a.createdAt)); int kept = 0; var versions = new HashSet<string>(); foreach (ProgramArchive value in values) if (value.profileId == profileId) { try { Read(dataRoot, value.id, true); if (versions.Add(value.version) && kept < 3) kept++; else Remove(dataRoot, value.id); } catch { } } }
    }
}
