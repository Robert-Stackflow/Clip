using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;

namespace ClipUpdate
{
    public sealed class RollbackPointer { public int version; public string profileId; public string directory; public string previousDirectory; public bool encrypted; }
    public sealed class RollbackTicket
    {
        public int pid; public string executable; public string archiveId; public string archiveSha256; public string currentVersion; public string currentProgramSha256;
        public string currentCheckpointId; public string profileId; public string pointerSha256; public string directory; public string pointer;
        public Dictionary<string, VersionFile> files;
#if UPDATE_VERIFICATION
        public string testFault;
#endif
    }
    public sealed class RollbackJournal
    {
        public string format; public int version; public string phase; public RollbackTicket ticket; public ProgramArchive target; public ProgramArchive current;
        public string currentPending; public string beforePointer; public string stage; public string previous; public bool success;
    }
    internal static class RollbackHost
    {
        static string Own { get { return Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location); } }
        static string DataRoot(string folder)
        {
            ProgramPaths.DirectorySafe(folder); string actions = Path.GetDirectoryName(folder), root = Path.GetDirectoryName(actions), name = Path.GetFileName(folder);
            if (Path.GetFileName(actions) != "rollback-actions" || !name.StartsWith("action-", StringComparison.Ordinal) || !ProgramPaths.Id(name.Substring(7))) throw new Exception("ROLLBACK_PATH");
            ProgramPaths.DirectorySafe(root); return root;
        }
        static string PointerFile(string root) { return Path.Combine(root, "storage-location.json"); }
        static string Manifest(string root, string id) { return Path.Combine(root, "program-versions", id, "archive.json"); }
        static void Log(string message) { try { File.AppendAllText(Path.Combine(Own, "rollback.log"), DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine); } catch { } }
        static void Result(bool success, string version, string reason)
        { ProgramPaths.Atomic(Path.Combine(Own, "result.json"), ProgramPaths.Json.Serialize(new { success = success, version = version, reason = reason, time = DateTime.UtcNow.ToString("o") })); }
        static void Journal(RollbackJournal journal, string phase)
        { journal.phase = phase; ProgramPaths.Atomic(Path.Combine(Own, "journal.json"), ProgramPaths.Json.Serialize(journal)); Log("Transaction phase " + phase + "."); }
        static void Restart() { if (File.Exists(ProgramPaths.Executable)) Process.Start(new ProcessStartInfo(ProgramPaths.Executable) { UseShellExecute = false, WorkingDirectory = ProgramPaths.Install }); }
        static RollbackPointer Pointer(string value)
        {
            if (value == null || value.Length > 16384) throw new Exception("ROLLBACK_POINTER"); var pointer = ProgramPaths.Json.Deserialize<RollbackPointer>(value);
            if (pointer == null || pointer.version != 1 || !ProgramPaths.Id(pointer.profileId) || pointer.directory == null) throw new Exception("ROLLBACK_POINTER"); ProgramPaths.DirectorySafe(pointer.directory); return pointer;
        }
        static string OriginalPointer(RollbackJournal journal) { return Encoding.UTF8.GetString(Convert.FromBase64String(journal.beforePointer)).TrimStart('\uFEFF'); }
        static string HashBytes(byte[] data) { using (var hash = System.Security.Cryptography.SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(data)).Replace("-", "").ToLowerInvariant(); }
        static void NoAppProcesses()
        { foreach (Process process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(ProgramPaths.Executable))) using (process) if (!process.HasExited && ProgramPaths.Same(process.MainModule.FileName, ProgramPaths.Executable)) throw new Exception("ROLLBACK_APP_RUNNING"); }
        static void TicketShape(RollbackTicket ticket)
        { if (ticket == null || ticket.executable == null || !ProgramPaths.Same(ticket.executable, ProgramPaths.Executable) || !ProgramPaths.Id(ticket.archiveId) || !ProgramPaths.Id(ticket.currentCheckpointId) || !ProgramPaths.Id(ticket.profileId) || !ProgramPaths.Version(ticket.currentVersion) || !ProgramPaths.Digest(ticket.archiveSha256) || !ProgramPaths.Digest(ticket.currentProgramSha256) || !ProgramPaths.Digest(ticket.pointerSha256)) throw new Exception("ROLLBACK_TICKET"); }
        static void Prepared(string root, RollbackTicket ticket)
        {
            if (ticket.directory == null || !ProgramPaths.Same(Path.GetDirectoryName(ticket.directory), root) || !Path.GetFileName(ticket.directory).StartsWith("version-recovered-", StringComparison.Ordinal) || !ProgramPaths.Id(Path.GetFileName(ticket.directory).Substring(18))) throw new Exception("ROLLBACK_PATH");
            ProgramPaths.DirectorySafe(ticket.directory); var pointer = Pointer(ticket.pointer);
            if (pointer.profileId != ticket.profileId || !ProgramPaths.Same(pointer.directory, ticket.directory) || ticket.files == null || !ticket.files.ContainsKey("history.sqlite") || pointer.encrypted != ticket.files.ContainsKey("history-vault.json")) throw new Exception("ROLLBACK_POINTER");
            if (Directory.GetDirectories(ticket.directory).Length > 0 || Directory.GetFiles(ticket.directory).Length != ticket.files.Count) throw new Exception("ROLLBACK_DATA_CHANGED");
            foreach (var file in ticket.files)
            {
                if (file.Key != "history.sqlite" && file.Key != "history-vault.json") throw new Exception("ROLLBACK_DATA_CHANGED"); VersionFile v = file.Value; string full = Path.Combine(ticket.directory, file.Key);
                if (v == null || v.bytes < 1 || v.bytes > 512L * 1024 * 1024 || !ProgramPaths.Digest(v.sha256) || new FileInfo(full).Length != v.bytes || ProgramPaths.Hash(full) != v.sha256) throw new Exception("ROLLBACK_DATA_CHANGED");
            }
        }
        static ProgramArchive Validate(string root, RollbackTicket ticket, bool live)
        {
            TicketShape(ticket);
            ProgramArchive archive = ProgramVersions.Read(root, ticket.archiveId, true);
            if (archive.profileId != ticket.profileId || ProgramPaths.Hash(Manifest(root, archive.id)) != ticket.archiveSha256 || new Version(archive.version) >= new Version(ticket.currentVersion)) throw new Exception("ROLLBACK_CHANGED");
            Prepared(root, ticket);
            if (live)
            {
                if (!ProgramVersions.Installed(ticket.executable) || ProgramVersions.InstalledVersion() != ticket.currentVersion || ProgramPaths.Hash(Path.Combine(ProgramPaths.Install, "resources", "app.asar")) != ticket.currentProgramSha256 || ProgramPaths.Hash(PointerFile(root)) != ticket.pointerSha256) throw new Exception("ROLLBACK_CONTEXT_CHANGED");
                var before = Pointer(File.ReadAllText(PointerFile(root), Encoding.UTF8)); if (before.profileId != ticket.profileId || !ProgramPaths.Same(before.directory, Pointer(ticket.pointer).previousDirectory)) throw new Exception("ROLLBACK_POINTER");
                ProgramVersions.Checkpoint(root, ticket.currentCheckpointId, ticket.profileId, ticket.currentVersion);
            }
            return archive;
        }
        static void Fault(RollbackTicket ticket, string point)
        {
#if UPDATE_VERIFICATION
            if (ticket.testFault == point) throw new Exception("ROLLBACK_TEST_" + point);
            if (ticket.testFault == "crash-" + point) Environment.Exit(97);
#endif
        }
        static void OwnedSibling(string value, string suffix, string action)
        {
            string expected = Path.Combine(Path.GetDirectoryName(ProgramPaths.Install), ".clip-rollback-" + action + suffix);
            if (!ProgramPaths.Same(value, expected)) throw new Exception("ROLLBACK_PATH");
            if (Directory.Exists(value)) ProgramPaths.DirectorySafe(value);
        }
        static void ValidateJournal(string root, RollbackJournal journal)
        {
            if (journal == null || journal.format != "clip-program-transaction" || journal.version != 1 || !new HashSet<string> { "prepared", "program", "registration", "pointer", "complete", "restored" }.Contains(journal.phase) || journal.current == null || !ProgramPaths.Id(journal.current.id)) throw new Exception("ROLLBACK_JOURNAL");
            TicketShape(journal.ticket); string action = Path.GetFileName(Own).Substring(7); OwnedSibling(journal.stage, "-stage", action); OwnedSibling(journal.previous, "-current", action); ProgramVersions.ValidateRegistry(journal.current.registry); ProgramVersions.ValidateRegistry(journal.target.registry);
            if (!ProgramPaths.Same(journal.currentPending, Path.Combine(root, "program-versions", ".pending-" + journal.current.id)) || journal.current.version != journal.ticket.currentVersion || journal.current.profileId != journal.ticket.profileId || journal.current.checkpointId != journal.ticket.currentCheckpointId) throw new Exception("ROLLBACK_JOURNAL");
            if (HashBytes(Convert.FromBase64String(journal.beforePointer)) != journal.ticket.pointerSha256) throw new Exception("ROLLBACK_POINTER"); var before = Pointer(OriginalPointer(journal)); if (before.profileId != journal.ticket.profileId || !ProgramPaths.Same(before.directory, Pointer(journal.ticket.pointer).previousDirectory)) throw new Exception("ROLLBACK_POINTER");
        }
        static bool Matches(string directory, Dictionary<string, VersionFile> files)
        { if (!Directory.Exists(directory)) return false; try { ProgramVersions.VerifyTree(directory, files); return true; } catch { return false; } }
        static void CleanProgram(string directory, Dictionary<string, VersionFile> files)
        {
            if (!Directory.Exists(directory)) return; ProgramVersions.VerifyTree(directory, files);
            foreach (string name in files.Keys) File.Delete(Path.Combine(directory, name)); ProgramVersions.RemoveEmpty(directory);
        }
        static void Compensate(string root, RollbackJournal journal)
        {
            ValidateJournal(root, journal); string pointerHash = ProgramPaths.Hash(PointerFile(root));
            if (pointerHash != journal.ticket.pointerSha256 && pointerHash != HashBytes(Encoding.UTF8.GetBytes(journal.ticket.pointer))) throw new Exception("ROLLBACK_CONTEXT_CHANGED");
            if (Directory.Exists(journal.previous))
            {
                ProgramVersions.VerifyTree(journal.previous, journal.current.files);
                if (Directory.Exists(ProgramPaths.Install))
                {
                    ProgramVersions.VerifyTree(ProgramPaths.Install, journal.target.files);
                    if (Directory.Exists(journal.stage)) throw new Exception("ROLLBACK_CONTEXT_CHANGED"); Directory.Move(ProgramPaths.Install, journal.stage);
                }
                Directory.Move(journal.previous, ProgramPaths.Install);
            }
            else if (!Matches(ProgramPaths.Install, journal.current.files)) throw new Exception("ROLLBACK_CONTEXT_CHANGED");
            ProgramPaths.AtomicBytes(PointerFile(root), Convert.FromBase64String(journal.beforePointer));
            ProgramVersions.RestoreRegistry(journal.current.registry);
            string currentLeaf = Path.Combine(root, "program-versions", journal.current.id),shortcutSource = Directory.Exists(currentLeaf) ? currentLeaf : journal.currentPending;
            if (journal.current.shortcut) { ProgramPaths.FileSafe(Path.Combine(shortcutSource, "shortcut.lnk")); Directory.CreateDirectory(Path.GetDirectoryName(ProgramPaths.Shortcut)); if (File.Exists(ProgramPaths.Shortcut)) ProgramPaths.FileSafe(ProgramPaths.Shortcut); File.Copy(Path.Combine(shortcutSource, "shortcut.lnk"), ProgramPaths.Shortcut, true); }
            else if (File.Exists(ProgramPaths.Shortcut)) { ProgramPaths.FileSafe(ProgramPaths.Shortcut); File.Delete(ProgramPaths.Shortcut); }
            ProgramVersions.VerifyTree(ProgramPaths.Install, journal.current.files); if (ProgramVersions.InstalledVersion() != journal.ticket.currentVersion) throw new Exception("ROLLBACK_REGISTRATION");
            journal.success = false; Journal(journal, "restored"); ProgramPaths.RecoveryEntry(Path.Combine(Own, "RollbackHost.exe"), true); Log("Original program, registration and history pointer restored.");
            try { CleanProgram(journal.stage, journal.target.files); } catch (Exception cleanup) { Log("Preserved stage: " + cleanup.Message); }
        }
        static void Complete(string root, RollbackJournal journal)
        {
            ProgramVersions.VerifyTree(ProgramPaths.Install, journal.target.files); Prepared(root, journal.ticket);
            if (ProgramVersions.InstalledVersion() != journal.target.version || File.ReadAllText(PointerFile(root), Encoding.UTF8) != journal.ticket.pointer) throw new Exception("ROLLBACK_CONTEXT_CHANGED");
            if (Directory.Exists(journal.currentPending)) ProgramVersions.Publish(root, journal.current, journal.currentPending);
            ProgramVersions.Read(root, journal.current.id, true); journal.success = true; Journal(journal, "complete");
            ProgramPaths.RecoveryEntry(Path.Combine(Own, "RollbackHost.exe"), true);
            Result(true, journal.target.version, "");
            try { CleanProgram(journal.previous, journal.current.files); } catch (Exception cleanup) { Log("Preserved previous program: " + cleanup.Message); }
            ProgramVersions.Retain(root, journal.ticket.profileId, journal.target.id);
        }
        static int Recover()
        {
            string root = DataRoot(Own); NoAppProcesses(); RollbackJournal journal = ProgramPaths.Read<RollbackJournal>(Path.Combine(Own, "journal.json"), 4 * 1024 * 1024); ValidateJournal(root, journal);
            if (journal.phase == "complete") { ProgramVersions.VerifyTree(ProgramPaths.Install,journal.target.files); if(ProgramVersions.InstalledVersion()!=journal.target.version||File.ReadAllText(PointerFile(root),Encoding.UTF8)!=journal.ticket.pointer)throw new Exception("ROLLBACK_CONTEXT_CHANGED"); ProgramPaths.RecoveryEntry(Path.Combine(Own,"RollbackHost.exe"),true); }
            else if (journal.phase == "restored") { if (!Matches(ProgramPaths.Install, journal.current.files) || ProgramPaths.Hash(PointerFile(root)) != journal.ticket.pointerSha256) throw new Exception("ROLLBACK_CONTEXT_CHANGED"); ProgramPaths.RecoveryEntry(Path.Combine(Own, "RollbackHost.exe"), true); }
            else { Compensate(root, journal); Result(false, journal.target.version, "ROLLBACK_INTERRUPTED"); }
            Restart(); return 0;
        }
        static void Transaction(string root, RollbackTicket ticket, ProgramArchive target)
        {
            string pending; ProgramArchive current = ProgramVersions.Capture(root, ticket.currentCheckpointId, ticket.profileId, target.version, "rollback", out pending);
            string action = Path.GetFileName(Own).Substring(7);
            var journal = new RollbackJournal { format = "clip-program-transaction", version = 1, ticket = ticket, target = target, current = current, currentPending = pending, beforePointer = Convert.ToBase64String(File.ReadAllBytes(PointerFile(root))), stage = Path.Combine(Path.GetDirectoryName(ProgramPaths.Install), ".clip-rollback-" + action + "-stage"), previous = Path.Combine(Path.GetDirectoryName(ProgramPaths.Install), ".clip-rollback-" + action + "-current") };
            if (Directory.Exists(journal.stage) || Directory.Exists(journal.previous)) throw new Exception("ROLLBACK_PATH");
            DriveInfo drive = new DriveInfo(Path.GetPathRoot(ProgramPaths.Install)); if (drive.AvailableFreeSpace < target.bytes + 128L * 1024 * 1024) throw new Exception("ROLLBACK_SPACE");
            ProgramVersions.CopyTree(ProgramVersions.Program(root, target.id), journal.stage); ProgramVersions.VerifyTree(journal.stage, target.files); Journal(journal, "prepared"); ProgramPaths.RecoveryEntry(Path.Combine(Own, "RollbackHost.exe"), false);
            try
            {
                Fault(ticket, "prepared"); Validate(root, ticket, true);
                Directory.Move(ProgramPaths.Install, journal.previous); Directory.Move(journal.stage, ProgramPaths.Install); Journal(journal, "program"); Fault(ticket, "program");
                ProgramVersions.RestoreRegistry(target.registry); ProgramVersions.Shortcut(root, target); Journal(journal, "registration"); Fault(ticket, "registration");
                if (ProgramPaths.Hash(PointerFile(root)) != ticket.pointerSha256) throw new Exception("ROLLBACK_CONTEXT_CHANGED"); Prepared(root, ticket); ProgramPaths.Atomic(PointerFile(root), ticket.pointer); Journal(journal, "pointer"); Fault(ticket, "pointer");
                Complete(root, journal);
            }
            catch (Exception error) { Log(error.ToString()); if (journal.phase == "complete") { Log("Rollback committed; post-commit work will be retried on recovery."); return; } Compensate(root, journal); throw; }
        }
        static int Main(string[] args)
        {
            bool exited = false, reading = args.Length == 2; RollbackTicket ticket = null;
            try
            {
                if (args.Length == 2 && (args[0] == "--list" || args[0] == "--inspect" || args[0] == "--delete"))
                {
                    string[] value = Encoding.UTF8.GetString(Convert.FromBase64String(args[1])).Split('\n'); ProgramPaths.DirectorySafe(value[0]);
                    if (args[0] == "--list") { var result = new List<object>(); foreach (ProgramArchive a in ProgramVersions.List(value[0])) result.Add(new { id = a.id, version = a.version, installedTo = a.installedTo, createdAt = a.createdAt, bytes = a.bytes, checkpointId = a.checkpointId, profileId = a.profileId, reason = a.reason }); Console.WriteLine(ProgramPaths.Json.Serialize(result)); }
                    else { if (value.Length != 2) throw new Exception("ROLLBACK_ID"); ProgramArchive archive = ProgramVersions.Read(value[0], value[1], true); if (args[0] == "--delete") ProgramVersions.Remove(value[0], value[1]); Console.WriteLine(ProgramPaths.Json.Serialize(new { entry = archive, manifestSha256 = File.Exists(Manifest(value[0], value[1])) ? ProgramPaths.Hash(Manifest(value[0], value[1])) : "" })); }
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--recover") return Recover();
                if (args.Length != 1 || !ProgramPaths.Same(Path.GetDirectoryName(args[0]), Own) || Path.GetFileName(args[0]) != "handoff.json") return 2;
                string root = DataRoot(Own); ticket = ProgramPaths.Read<RollbackTicket>(args[0], 131072); ProgramArchive target = Validate(root, ticket, true);
                using (Process parent = Process.GetProcessById(ticket.pid))
                {
                    if (!ProgramPaths.Same(parent.MainModule.FileName, ticket.executable)) throw new Exception("ROLLBACK_PARENT");
                    Console.WriteLine("ready"); Console.Out.Flush(); if (Console.ReadLine() != "rollback") return 3;
                    Console.WriteLine("armed"); Console.Out.Flush(); Console.Out.Close(); Console.In.Close(); Console.Error.Close();
                    if (!parent.WaitForExit(ProgramPaths.ExitWait)) throw new Exception("ROLLBACK_EXIT_TIMEOUT");
                }
                exited = true; NoAppProcesses(); target = Validate(root, ticket, true); Transaction(root, ticket, target);
                try { Restart(); } catch (Exception restart) { Log("Committed rollback; restart failed: " + restart); } return 0;
            }
            catch (Exception error)
            {
                if (reading) { Console.Error.WriteLine(error.Message); return 1; }
                Log(error.ToString()); try { Result(false, ticket == null ? "" : ticket.currentVersion, error.Message); } catch { }
                if (exited) try { if (ticket != null && ProgramVersions.InstalledVersion() == ticket.currentVersion && ProgramPaths.Hash(Path.Combine(ProgramPaths.Install, "resources", "app.asar")) == ticket.currentProgramSha256) Restart(); } catch { }
                return 1;
            }
        }
    }
}
