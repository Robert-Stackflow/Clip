import type {App} from 'electron';

export const LOGIN_ITEM_NAME='com.cloudchewie.clip';
export const LOGIN_STARTUP_ARGUMENT='--startup';
export const isLoginStartup=(args:readonly string[])=>args.includes(LOGIN_STARTUP_ARGUMENT);
export const manualLaunchArguments=(args:readonly string[])=>args.filter(arg=>arg!==LOGIN_STARTUP_ARGUMENT);

/** Keep one stable startup entry pointing at the currently installed executable. */
export function configureLoginItem(app:Pick<App,'setLoginItemSettings'>,enabled:boolean,executable=process.execPath){
 app.setLoginItemSettings({name:LOGIN_ITEM_NAME,path:executable,args:[LOGIN_STARTUP_ARGUMENT],openAtLogin:enabled,enabled});
}
