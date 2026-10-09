import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyActivity,restoreActivity,type ActivityStore} from './activity';
const KEY='nomi:activity:v1';
export async function loadActivity():Promise<ActivityStore>{const raw=await AsyncStorage.getItem(KEY);return raw?restoreActivity(JSON.parse(raw)):emptyActivity();}
let pending:Promise<void>=Promise.resolve();
export function saveActivity(store:ActivityStore){const raw=JSON.stringify(store);pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
