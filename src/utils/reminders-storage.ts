import AsyncStorage from '@react-native-async-storage/async-storage';
import {notifications} from './notifications';
import {cancelAllReminders,emptyReminders,restoreReminders,type ReminderStore} from './reminders';
const KEY='nomi:reminders:v1';
export async function loadReminders():Promise<ReminderStore>{const raw=await AsyncStorage.getItem(KEY);return raw?restoreReminders(JSON.parse(raw)):emptyReminders();}
let pending:Promise<void>=Promise.resolve();
export function saveReminders(store:ReminderStore){const raw=JSON.stringify(restoreReminders(store));pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
/** "Delete my data" (Section 8) calls this: cancels every scheduled notification, then removes the store. A store that cannot be read still gets its notifications cancelled through the adapter's cancel-all. */
export async function deleteReminders(){const store=await loadReminders().catch(()=>emptyReminders());await cancelAllReminders(store,notifications);await AsyncStorage.removeItem(KEY);}
