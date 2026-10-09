import AsyncStorage from '@react-native-async-storage/async-storage';
import {dayInUB} from './personal';
import {count,emptyUsage,readDaily,type DailyUsage} from './usage';
const KEY='nomi:usage:v1';
export async function loadUsage():Promise<DailyUsage>{
 const raw=await AsyncStorage.getItem(KEY),today=dayInUB();if(!raw)return emptyUsage(today);
 const v=JSON.parse(raw);if(!v||v.day!==today)return emptyUsage(today);
 return {day:today,messages:count(v.messages),aiRequests:count(v.aiRequests),tokens:count(v.tokens),server:readDaily(v.server)??null};
}
let pending:Promise<void>=Promise.resolve();
export function saveUsage(usage:DailyUsage){const raw=JSON.stringify(usage);pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
