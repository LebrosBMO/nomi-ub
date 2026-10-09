import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyFollowups,restoreFollowups,type FollowupStore} from './followups';
/** Exported for "delete my data" (Section 8). */
export const FOLLOWUPS_KEY='nomi:followups:v1';
export async function loadFollowups():Promise<FollowupStore>{const raw=await AsyncStorage.getItem(FOLLOWUPS_KEY);return raw?restoreFollowups(JSON.parse(raw)):emptyFollowups();}
let pending:Promise<void>=Promise.resolve();
export function saveFollowups(store:FollowupStore){const raw=JSON.stringify(store);pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(FOLLOWUPS_KEY,raw));return pending;}
/** "Delete my data" (Section 8): drops the pending follow-ups. Nothing is scheduled for them, so there is nothing else to cancel. */
export async function deleteFollowups(){await AsyncStorage.removeItem(FOLLOWUPS_KEY);}
