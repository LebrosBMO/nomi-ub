import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyBoxes,restoreBoxes,type BoxStore} from './boxes';
const KEY='nomi:boxes:v1';
export async function loadBoxes():Promise<BoxStore>{const raw=await AsyncStorage.getItem(KEY);return raw?restoreBoxes(JSON.parse(raw)):emptyBoxes();}
let pending:Promise<void>=Promise.resolve();
export function saveBoxes(store:BoxStore){const raw=JSON.stringify(restoreBoxes(store));pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
