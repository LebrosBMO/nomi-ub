import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyReports,restoreReports,type ReportStore} from './reports';
const KEY='nomi:reports:v1';
export async function loadReports():Promise<ReportStore>{const raw=await AsyncStorage.getItem(KEY);return raw?restoreReports(JSON.parse(raw)):emptyReports();}
let pending:Promise<void>=Promise.resolve();
export function saveReports(store:ReportStore){const raw=JSON.stringify(store);pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
