import AsyncStorage from '@react-native-async-storage/async-storage';
import {emptyPayments,restorePayments,type PaymentStore} from './payments';
const KEY='nomi:payments:v1';
export async function loadPayments():Promise<PaymentStore>{const raw=await AsyncStorage.getItem(KEY);return raw?restorePayments(JSON.parse(raw)):emptyPayments();}
let pending:Promise<void>=Promise.resolve();
export function savePayments(store:PaymentStore){const raw=JSON.stringify(restorePayments(store));pending=pending.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,raw));return pending;}
