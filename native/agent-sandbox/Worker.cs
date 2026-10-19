// Trusted Windows launcher. Only the child enters the LPAC; no agent command is
// ever evaluated by the launcher or a host shell. Built with Windows' .NET 4 compiler.
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Threading;
#pragma warning disable 0649 // Launch configuration fields are populated by the JSON serializer.

class Worker {
    public class Config {
        public string executable, cwd, workspace, home, cancel;
        public string[] args, reads, forbidden;
        public Dictionary<string,string> env;
        public int parent;
    }
    const uint EXTENDED = 0x80000, SUSPENDED = 4, UNICODE = 0x400, NO_WINDOW = 0x08000000;
    const uint INHERIT = 1, START_HANDLES = 0x100, WAIT_TIMEOUT = 258;
    static IntPtr job, sid, attributes;
    static string moniker;
    class GrantRecord { public IntPtr handle; public bool directory; public FileSystemRights rights; }
    static HashSet<string> grantRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    static int grantCount;
    static Mutex aclMutex = new Mutex(false,"Local\\Spectrum.AgentWorker.Acl."+WindowsIdentity.GetCurrent().User.Value);
    static SecurityIdentifier identity;
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO {
        public int cb; public IntPtr reserved, desktop, title;
        public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
        public ushort show,reserved2; public IntPtr reservedPtr,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO info; public IntPtr list; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS { public IntPtr process,thread; public uint pid,tid; }
    [StructLayout(LayoutKind.Sequential)] struct CAPS { public IntPtr sid,capabilities; public uint count,reserved; }
    [StructLayout(LayoutKind.Sequential)] struct SID_ATTRIBUTE { public IntPtr sid; public uint attributes; }
    [StructLayout(LayoutKind.Sequential)] struct FILE_INFO {
        public uint attributes,createLow,createHigh,accessLow,accessHigh,writeLow,writeHigh,volume,sizeHigh,sizeLow,links,indexHigh,indexLow;
    }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT {
        public long processTime,jobTime; public uint flags;
        public UIntPtr minWorking,maxWorking; public uint active;
        public UIntPtr affinity; public uint priority,scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct LIMIT {
        public BASIC_LIMIT basic; public IO_COUNTERS io;
        public UIntPtr processMemory,jobMemory,peakProcess,peakJob;
    }
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string desc,IntPtr caps,uint count,out IntPtr sid);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernelbase.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool DeriveCapabilitySidsFromName(string name,out IntPtr groups,out uint groupCount,out IntPtr capabilities,out uint capabilityCount);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attr,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr procAttrs,IntPtr threadAttrs,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PROCESS process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref LIMIT data,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr handle,out FILE_INFO info);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(IntPtr handle,StringBuilder path,uint size,uint flags);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetKernelObjectSecurity(IntPtr handle,uint info,byte[] descriptor,uint size,out uint needed);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetKernelObjectSecurity(IntPtr handle,uint info,byte[] descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    static void Check(bool ok,string operation) { if(!ok) {int error=Marshal.GetLastWin32Error();throw new System.ComponentModel.Win32Exception(error,operation+" (Windows error "+error+")");} }
    static bool Within(string file,string root) { return file.Equals(root,StringComparison.OrdinalIgnoreCase) || file.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase); }
    static string Canonical(string file) {
        string full=Path.GetFullPath(file).TrimEnd('\\');
        if(full.StartsWith(@"\\") || full.IndexOf(':',2)>=0) throw new Exception("Network paths and alternate streams are not allowed.");
        for(string part=full; !String.IsNullOrEmpty(part); part=Path.GetDirectoryName(part)) {
            if((File.Exists(part)||Directory.Exists(part)) && (File.GetAttributes(part)&FileAttributes.ReparsePoint)!=0) throw new Exception("A grant contains a reparse point: "+part);
        }
        return full;
    }
    static void Rule(GrantRecord grant,bool remove) {
        try {aclMutex.WaitOne();} catch(AbandonedMutexException) {}
        try {
        uint needed;GetKernelObjectSecurity(grant.handle,4,null,0,out needed);
        var bytes=new byte[needed];Check(GetKernelObjectSecurity(grant.handle,4,bytes,needed,out needed),"Read grant ACL");
        if(remove) {
            var descriptor=new RawSecurityDescriptor(bytes,0);var dacl=descriptor.DiscretionaryAcl;
            var clean=new RawAcl(dacl.Revision,dacl.Count);
            foreach(GenericAce ace in dacl) {var qualified=ace as QualifiedAce;if(qualified==null||!qualified.SecurityIdentifier.Equals(identity)) clean.InsertAce(clean.Count,ace);}
            descriptor.DiscretionaryAcl=clean;var result=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(result,0);
            Check(SetKernelObjectSecurity(grant.handle,4,result),"Remove grant ACL");return;
        }
        FileSystemSecurity acl=grant.directory?(FileSystemSecurity)new DirectorySecurity():new FileSecurity();acl.SetSecurityDescriptorBinaryForm(bytes,AccessControlSections.Access);
        var rule=new FileSystemAccessRule(identity,grant.rights,grant.directory?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow);
        acl.AddAccessRule(rule);
        // The kernel operation changes this object only. Never let a recursive ACL
        // library follow an agent-controlled junction or hardlink on our behalf.
        Check(SetKernelObjectSecurity(grant.handle,4,acl.GetSecurityDescriptorBinaryForm()),"Set grant ACL");
        } finally {aclMutex.ReleaseMutex();}
    }
    static readonly FileSystemRights WriteRights=FileSystemRights.ReadAndExecute|FileSystemRights.Write|FileSystemRights.Delete;
    static void GrantTree(string root,FileSystemRights rights,bool secrets,bool remove=false) {
        if(!remove) grantRoots.Add(root);
        var pending=new Stack<string>();pending.Push(root);
        while(pending.Count>0) {
            if(!remove && ++grantCount>=100000) throw new Exception("Too many runtime/workspace files to grant safely.");
            string file=pending.Pop();
            if(!remove && secrets && file!=root && Secret(Path.GetFileName(file))) continue;
            IntPtr handle=CreateFile(file,0x00060080,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
            if(remove && handle==new IntPtr(-1)) continue;
            Check(handle!=new IntPtr(-1),"Open grant without following links: "+file);
            try {
                FILE_INFO info;Check(GetFileInformationByHandle(handle,out info),"Inspect grant object");
                bool reparse=(info.attributes&0x400)!=0;
                if(reparse && !remove) throw new Exception("A runtime/workspace contains a reparse point: "+file);
                bool dir=(info.attributes&0x10)!=0;
                if(!dir && info.links!=1 && !remove) throw new Exception("A runtime/workspace contains a hardlinked file: "+file);
                var final=new StringBuilder(32768);uint length=GetFinalPathNameByHandle(handle,final,(uint)final.Capacity,0);
                Check(length>0&&length<final.Capacity,"Resolve grant object");
                string actual=final.ToString();if(actual.StartsWith(@"\\?\")) actual=actual.Substring(4);
                if(!Within(actual,root)) {if(remove) continue;throw new Exception("A grant escaped its approved directory.");}
                var grant=new GrantRecord{handle=handle,directory=dir,rights=rights};
                Rule(grant,remove);
                if(dir && !reparse) foreach(string entry in Directory.GetFileSystemEntries(file)) pending.Push(entry);
            } finally {CloseHandle(handle);}
        }
    }
    static bool Secret(string name) {
        name=name.ToLowerInvariant();
        return name==".spectrum"||name==".git"||name==".claude"||name==".env"||name.StartsWith(".env.")||name.EndsWith(".pem")||name.EndsWith(".key");
    }
    static IntPtr Attribute(int key,object value) {
        IntPtr buffer=Marshal.AllocHGlobal(Marshal.SizeOf(value));
        Marshal.StructureToPtr(value,buffer,false);
        Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(key),buffer,new IntPtr(Marshal.SizeOf(value)),IntPtr.Zero,IntPtr.Zero),"Set process attribute");
        return buffer;
    }
    // Standard Windows CRT quoting; arguments never pass through cmd.exe.
    static string Quote(string value) {
        var result=new StringBuilder("\""); int slashes=0;
        foreach(char c in value) { if(c=='\\') {slashes++;continue;} if(c=='\"') {result.Append('\\',slashes*2+1);result.Append(c);} else {result.Append('\\',slashes);result.Append(c);} slashes=0; }
        result.Append('\\',slashes*2);return result.Append('"').ToString();
    }
    static int Run(Config c) {
        c.workspace=Canonical(c.workspace);c.home=Canonical(c.home);c.executable=Canonical(c.executable);c.cwd=Canonical(c.cwd);
        if(!Within(c.cwd,c.workspace)) throw new Exception("The working directory must be inside the workspace.");
        if(!c.executable.EndsWith(".exe",StringComparison.OrdinalIgnoreCase)) throw new Exception("Select a native .exe launcher. For npm/Python adapters select the interpreter and pass its script as an argument.");
        moniker="Spectrum.Agent."+Guid.NewGuid().ToString("N");
        int hr=CreateAppContainerProfile(moniker,moniker,"Spectrum isolated agent",IntPtr.Zero,0,out sid);
        if(hr<0) Marshal.ThrowExceptionForHR(hr);
        identity=new SecurityIdentifier(sid);
        foreach(string read in c.reads.Distinct(StringComparer.OrdinalIgnoreCase)) {
            string file=Canonical(read);
            if(file.Length<=3 || Within(c.workspace,file) || Within(c.home,file) || c.forbidden.Any(f=>Within(Canonical(f),file)||Within(file,Canonical(f)))) throw new Exception("Runtime grant overlaps private or project data: "+file);
            GrantTree(file,FileSystemRights.ReadAndExecute,true);
        }
        GrantTree(c.workspace,WriteRights,true); GrantTree(c.home,WriteRights,false);
        job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero,"Create job");
        var limit=new LIMIT(); limit.basic.flags=0x2000; // KILL_ON_JOB_CLOSE; no breakaway
        Check(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(limit)),"Set job containment");
        IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref size);
        attributes=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(attributes,3,0,ref size),"Initialize process attributes");
        var buffers=new List<IntPtr>();
        PROCESS proc=new PROCESS(); IntPtr environment=IntPtr.Zero,parent=IntPtr.Zero;
        try {
            // Registry reads are needed by Winsock initialization. No COM,
            // private-network, loopback-exemption, or host-broker capability.
            var caps=new List<IntPtr>();
            foreach(string name in new[]{"registryRead", "internetClient"}) {
                IntPtr groups,capabilities;uint groupCount,capabilityCount;
                Check(DeriveCapabilitySidsFromName(name,out groups,out groupCount,out capabilities,out capabilityCount),"Derive capability");
                try {
                    for(uint i=0;i<capabilityCount;i++) {
                        IntPtr original=Marshal.ReadIntPtr(capabilities,(int)i*IntPtr.Size);
                        var value=new SecurityIdentifier(original);var bytes=new byte[value.BinaryLength];value.GetBinaryForm(bytes,0);
                        IntPtr copy=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,copy,bytes.Length);buffers.Add(copy);caps.Add(copy);
                    }
                } finally {
                    for(uint i=0;i<groupCount;i++) LocalFree(Marshal.ReadIntPtr(groups,(int)i*IntPtr.Size));
                    for(uint i=0;i<capabilityCount;i++) LocalFree(Marshal.ReadIntPtr(capabilities,(int)i*IntPtr.Size));
                    LocalFree(groups);LocalFree(capabilities);
                }
            }
            int capSize=Marshal.SizeOf(typeof(SID_ATTRIBUTE));IntPtr capArray=Marshal.AllocHGlobal(capSize*caps.Count);buffers.Add(capArray);
            for(int i=0;i<caps.Count;i++) Marshal.StructureToPtr(new SID_ATTRIBUTE{sid=caps[i],attributes=4},IntPtr.Add(capArray,i*capSize),false);
            buffers.Add(Attribute(0x20009,new CAPS{sid=sid,capabilities=capArray,count=(uint)caps.Count}));
            buffers.Add(Attribute(0x2000F,(uint)1)); // ALL_APPLICATION_PACKAGES_OPT_OUT
            var handles=new[]{GetStdHandle(-10),GetStdHandle(-11),GetStdHandle(-12)};
            foreach(IntPtr handle in handles) Check(SetHandleInformation(handle,INHERIT,INHERIT),"Set stdio inheritance");
            IntPtr list=Marshal.AllocHGlobal(IntPtr.Size*3); buffers.Add(list); Marshal.Copy(handles,0,list,3);
            Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),list,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero),"Restrict inherited handles");
            var startup=new STARTUPINFOEX();startup.info.cb=Marshal.SizeOf(startup);startup.list=attributes;
            startup.info.flags=START_HANDLES|1;startup.info.show=0;startup.info.input=handles[0];startup.info.output=handles[1];startup.info.error=handles[2];
            parent=OpenProcess(0x100000,false,c.parent);Check(parent!=IntPtr.Zero,"Monitor backend lifetime");
            string env=String.Join("\0",c.env.OrderBy(e=>e.Key,StringComparer.OrdinalIgnoreCase).Select(e=>e.Key+"="+e.Value))+"\0\0";
            environment=Marshal.StringToHGlobalUni(env);
            var cmd=new StringBuilder(String.Join(" ",new[]{c.executable}.Concat(c.args).Select(Quote)));
            Check(CreateProcess(c.executable,cmd,IntPtr.Zero,IntPtr.Zero,true,EXTENDED|SUSPENDED|UNICODE|0x10,environment,c.cwd,ref startup,out proc),"Launch LPAC agent");
            if(!AssignProcessToJobObject(job,proc.process)) {TerminateProcess(proc.process,1);Check(false,"Assign agent to job");}
            Check(ResumeThread(proc.thread)!=UInt32.MaxValue,"Resume contained agent");
            while(WaitForSingleObject(proc.process,100)==WAIT_TIMEOUT) {
                if(File.Exists(c.cancel)||WaitForSingleObject(parent,0)!=WAIT_TIMEOUT) {TerminateJobObject(job,130);return 130;}
            }
            uint code;Check(GetExitCodeProcess(proc.process,out code),"Read agent exit status");return (int)code;
        } finally {
            if(job!=IntPtr.Zero) TerminateJobObject(job,130);
            if(proc.thread!=IntPtr.Zero) CloseHandle(proc.thread);
            if(proc.process!=IntPtr.Zero) CloseHandle(proc.process);
            if(parent!=IntPtr.Zero) CloseHandle(parent);
            if(environment!=IntPtr.Zero) Marshal.FreeHGlobal(environment);
            foreach(var buffer in buffers) Marshal.FreeHGlobal(buffer);
        }
    }
    static int Main(string[] args) {
        int code=1;
        try {
            if(args.Length!=1) throw new Exception("Expected a trusted launch manifest.");
            var config=new JavaScriptSerializer().Deserialize<Config>(File.ReadAllText(args[0]));
            code=Run(config);
        } catch(Exception e) { Console.Error.WriteLine("Windows agent isolation failed: "+e.Message); }
        finally {
            if(job!=IntPtr.Zero) {TerminateJobObject(job,130);CloseHandle(job);}
            if(attributes!=IntPtr.Zero) {DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}
            foreach(var root in grantRoots) try {GrantTree(root,0,false,true);} catch(Exception e){Console.Error.WriteLine("Grant cleanup failed: "+e.Message);code=1;}
            if(sid!=IntPtr.Zero) FreeSid(sid);
            if(moniker!=null) {int result=DeleteAppContainerProfile(moniker);if(result<0){Console.Error.WriteLine("AppContainer cleanup failed: "+result);code=1;}}
        }
        return code;
    }
}
