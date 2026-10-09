import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyPersonal,restorePersonal,type PersonalState} from './personal';
const KEY='nomi:personal:v1';
export async function loadPersonal():Promise<PersonalState>{const raw=await AsyncStorage.getItem(KEY);return raw?restorePersonal(JSON.parse(raw)):emptyPersonal();}
let pending:Promise<void>=Promise.resolve();
export function savePersonal(state:PersonalState){const raw=JSON.stringify(restorePersonal(state));pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
