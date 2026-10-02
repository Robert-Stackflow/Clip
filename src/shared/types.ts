import type {SelectionOptions,SelectionState,SelectionInput} from './selection';
import type {DesktopOptions,DesktopState} from './desktop';
import type {VaultState} from './vault';
import type {WebState,WebOptions} from './web-share';
import type {AIState,AIProfileInput,AIRequest,AIResult,TextScript,TextScriptInput,ScriptRequest,TextApply,IntegrationState,ExternalIntent} from './text-tools';
import type {DataState,StoragePlan,BackupSettingsInput,RestoreFile,RestorePreview} from './data';
import type {SyncState,SyncOptions} from './sync';
export type Kind = 'text' | 'link' | 'code' | 'image' | 'files';
export interface Payload { attachments?:import('./attachments').Attachment[]; formats?:import('./formats').StoredFormat[];omittedFormats?:string[]; text?: string; html?: string; rtf?: string; png?: string; files?: string[] }
export interface Clip { id: string; hash: string; kind: Kind; title: string; preview: string; source: string; createdAt: number; updatedAt: number; favorite: boolean; pinned: boolean; tags: string[]; bytes: number; thumbnail?: string; shared?:boolean;localOnly?:boolean;syncRetained?:boolean }
export interface Detail extends Clip { payload: Payload }
export interface Snippet { shortcut?:string; id: string; title: string; text: string; updatedAt: number; payload:Payload; kind:Kind; thumbnail?:string }
export interface SnippetInput { shortcut?:string; id?:string; title:string; text?:string; clipId?:string }
export interface Category { id:string; name:string; color:string; kind:'all'|Kind; contains:string; source:string; tag:string }
export interface OcrLanguage { tag:string; name:string }
export interface OcrStatus { languages:OcrLanguage[]; maxDimension:number; error?:string }
export interface OcrResult { text:string; language:string; scaled:boolean }
export interface CaptureScreen { id:number; name:string; width:number; height:number }
export interface Settings { theme: 'system'|'light'|'dark'; view: 'list'|'grid'; paused: boolean; maxItems: number; retentionDays: number; excludedApps: string[]; shortcut: string; quickShortcut: string; nextShortcut: string; launchAtLogin: boolean }
export interface State { stack:import('./stack').StackState; clips: Clip[]; snippets: import('./preview').SnippetSummary[]; queue: string[]; shelf:string[]; categories:Category[]; settings: Settings; desktop:DesktopOptions; dark: boolean; native: boolean; status: string; bytes: number; hotkeyError: string }
export type BatchAction='delete'|'favorite'|'enqueue'|'shelf'|'unshelf'|'tag';
export type ClipAction = 'favorite'|'pin'|'delete'|'enqueue'|'dequeue'|'up'|'down'|'split';
export interface API {
  programVersions():Promise<import('./program-versions').ProgramVersionEntry[]>;deleteProgramVersion(id:string):Promise<void>;chooseProgramVersion(id:string):Promise<import('./program-versions').ProgramRollbackChoice>;previewProgramVersion(token:string,password?:string,newPassword?:string,mode?:'password'|'recovery'):Promise<import('./program-versions').ProgramRollbackPreview>;rollbackProgramVersion(token:string,proof?:string):Promise<void>;cancelProgramRollback():Promise<void>;
  updateState():Promise<import('./updates').UpdateState>; configureUpdates(automatic:boolean):Promise<import('./updates').UpdateState>;
  checkUpdate():Promise<import('./updates').UpdateState>; downloadUpdate():Promise<import('./updates').UpdateState>; cancelUpdate():Promise<import('./updates').UpdateState>;
  installUpdate():Promise<import('./updates').UpdateState>; showUpdateDownload():Promise<void>; onUpdate(callback:(state:import('./updates').UpdateState)=>void):()=>void;
  configureLanguage(value:import('./language').LanguageChoice):Promise<import('./language').LanguageState>;
  configureAppearance(value:import('./appearance').UIAppearance):Promise<import('./appearance').AppearanceState>;
  stackState():Promise<import('./stack').StackState>; configureStack(value:import('./stack').StackOptions):Promise<void>; setStackRunning(value:boolean):Promise<void>; previewStack(order:'oldest'|'newest'):Promise<import('./stack').StackPreview>; commitStack(token:string):Promise<number>; cancelStackPreview():Promise<void>; reverseStack():Promise<void>;
  efficiencyState():Promise<import('./efficiency').EfficiencyState>; configureEfficiency(value:{historyEnabled:boolean;repliesShortcut:string}):Promise<void>;
  rememberSearch(query:string):Promise<void>;removeSearch(query:string|null):Promise<void>;
  replyIntent():Promise<import('./efficiency').ReplyIntent|null>;resolveReply(token:string,values:Record<string,string>|null):Promise<void>;
  openRecorder():Promise<void>;
  selectionState():Promise<SelectionState>;configureSelection(value:SelectionOptions):Promise<void>;readSelection():Promise<void>;selectionInput():Promise<SelectionInput|null>;
  showTray():Promise<void>;desktopState():Promise<DesktopState>;configureDesktop(value:DesktopOptions):Promise<void>;showQuick():Promise<void>;showShelf():Promise<void>;
  vaultState():Promise<VaultState>; prepareEncryption(password:string):Promise<{token:string;recoveryKey:string}>; cancelEncryption():Promise<void>; encryptHistory(token:string,proof:string):Promise<void>; cleanupPlaintext():Promise<void>; changeHistoryPassword(password:string):Promise<void>; configureVault(hello:boolean,idleMinutes:number):Promise<void>; lockHistory():Promise<void>;
  webState():Promise<WebState>;webStart(value:WebOptions):Promise<void>;webStop():Promise<void>;webInvite():Promise<string>;webApprove(id:string,accept:boolean,allowSend:boolean):Promise<void>;webRevoke(id:string):Promise<void>;webPublish(id:string):Promise<void>;webRemove(id:string):Promise<void>;webFollow(value:boolean):Promise<void>;
  syncState():Promise<SyncState>;syncConfigure(value:SyncOptions):Promise<void>;syncInvite(host:string):Promise<string>;syncJoin(code:string):Promise<void>;syncApprove(id:string,accept:boolean):Promise<void>;syncCancel():Promise<void>;syncRevoke(id:string):Promise<void>;syncNow():Promise<void>;syncShare(id:string):Promise<void>;syncLocal(id:string,only:boolean):Promise<void>;
  checkpoints():Promise<import('./checkpoints').CheckpointEntry[]>;createCheckpoint():Promise<void>;deleteCheckpoint(id:string):Promise<void>;
  chooseCheckpoint(id:string):Promise<import('./recovery').RecoveryChoice>;previewCheckpoint(token:string,password?:string,newPassword?:string,mode?:'password'|'recovery'):Promise<import('./recovery').RecoveryPreview>;restoreCheckpoint(token:string,proof?:string):Promise<void>;cancelCheckpoint():Promise<void>;
  dataState():Promise<DataState>; chooseStorage():Promise<StoragePlan|null>; migrateStorage(token:string):Promise<void>; chooseBackupFolder():Promise<string|null>;
  configureBackup(value:BackupSettingsInput):Promise<void>; backupNow():Promise<string|null>; exportProtected(password?:string):Promise<string|null>;
  chooseRestore(name?:string):Promise<RestoreFile|null>; previewRestore(token:string,password?:string):Promise<RestorePreview>; restoreBackup(token:string):Promise<number>; cancelRestore(token:string):Promise<void>;
  aiState():Promise<AIState>; aiProfile(value:AIProfileInput):Promise<string>; removeAIProfile(id:string):Promise<void>; defaultAIProfile(id:string):Promise<void>;
  aiModels(profileId:string,requestId:string):Promise<string[]>; aiRun(value:AIRequest):Promise<AIResult>; aiCancel(requestId:string):Promise<void>;
  scripts():Promise<TextScript[]>; saveScript(value:TextScriptInput):Promise<string>; removeScript(id:string):Promise<void>; runScript(value:ScriptRequest):Promise<string>; cancelScript(requestId:string):Promise<void>;
  scriptBackup(mode:'import'|'export'):Promise<string|null>; applyText(value:TextApply):Promise<string|null>;
  integrations():Promise<IntegrationState>; registerIntegration(enabled:boolean):Promise<void>; resolveExternal(id:string,accept:boolean):Promise<(ExternalIntent&{clipId?:string})|null>;
  preview(id:string):Promise<import('./preview').ClipPreview>;snippetPreview(id:string):Promise<import('./preview').SnippetPreview>;releasePreview(url:string):Promise<void>;
  state(): Promise<State>; detail(id:string): Promise<Detail>; search(query:string,category?:string):Promise<string[]>;
  recordShortcut(active:boolean):Promise<void>;
  action(id:string,action:ClipAction): Promise<void>; undo(): Promise<void>;
  edit(id:string,text:string,tags:string[]): Promise<void>;
  copy(id:string,paste:boolean,plain?:boolean):Promise<void>;
  next():Promise<void>; clearQueue():Promise<void>;queueAction(index:number,id:string,action:'dequeue'|'up'|'down',expected:string[]):Promise<void>;
  snippet(value:SnippetInput):Promise<void>;
  snippetDetail(id:string):Promise<Snippet>;
  removeSnippet(id:string):Promise<void>; useSnippet(id:string,paste:boolean,values?:Record<string,string>):Promise<void>;
  batch(ids:string[],action:BatchAction,tags?:string[]):Promise<void>;
  category(value:Omit<Category,'id'>&{id?:string}):Promise<void>; removeCategory(id:string):Promise<void>;
  addFiles():Promise<void>; dropFiles(files:File[]):Promise<void>; drag(id:string):void;
  metadata(value:import('./metadata').MetadataRequest):Promise<import('./metadata').MetadataResult>;cancelMetadata(requestId:string):Promise<void>;
  exportAttachment(id:string,index:number):Promise<string|null>;contentInfo(id:string,readFiles?:boolean):Promise<import('./formats').ContentInfo>;exportFormat(id:string,name:string):Promise<string|null>;
  editImage(id:string):Promise<void>;captureWindows():Promise<{token:string;name:string;thumbnail:string}[]>;screenshotWindow(token:string):Promise<string|null>;
  exportImage(id:string):Promise<string|null>;
  ocrStatus():Promise<OcrStatus>; ocr(id:string,language:string):Promise<OcrResult>; cancelOcr():Promise<void>; saveOcr(text:string):Promise<string>;
  openScrollCapture():Promise<void>;screens():Promise<CaptureScreen[]>; screenshot(mode:'region'|'screen',displayId:number):Promise<string|null>;
  settings(value:Settings):Promise<void>; backup(mode:'import'|'export'):Promise<string|null>;
  clear():Promise<void>; hide():Promise<void>; quit():Promise<void>;
  onChange(callback:()=>void):()=>void;
  onNotice(callback:(text:string)=>void):()=>void;
}
declare global { interface Window { clipper: API } }
