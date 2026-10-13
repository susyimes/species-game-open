import { serialize, deserialize } from './persistence.js';
import { sha256 } from '@noble/hashes/sha2.js';

const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const completed=t=>new Promise((resolve,reject)=>{t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('storage_aborted'));});
export function newIdentity(){
  if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function digest(text){const data=new TextEncoder().encode(text),bytes=crypto.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',data)):sha256(data);return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
export class WorldStore {
  constructor(db,owner=newIdentity()){this.db=db;this.owner=owner;this.saveId=null;this.token=null;}
  static async open({resumeDocument=false}={}){
    const opening=indexedDB.open('zhongxi-isle',1);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      db.createObjectStore('saves',{keyPath:'id'});db.createObjectStore('events',{keyPath:['saveId','seq']});
      db.createObjectStore('leases',{keyPath:'id'});db.createObjectStore('migration_backups',{keyPath:'id'});
    };
    let owner=newIdentity();
    if(resumeDocument){
      try{
        if(performance.getEntriesByType('navigation')[0]?.type==='reload')owner=sessionStorage.getItem('zhongxi-tab-owner')||owner;
        sessionStorage.setItem('zhongxi-tab-owner',owner);
      }catch{}
    }
    return new WorldStore(await request(opening),owner);
  }
  async latest(){
    const t=this.db.transaction('saves','readonly'),rows=await request(t.objectStore('saves').getAll());
    rows.sort((a,b)=>b.updatedAt-a.updatedAt);
    return rows[0]||null;
  }
  async acquire(saveId){
    const t=this.db.transaction('leases','readwrite'),done=completed(t),table=t.objectStore('leases');
    const old=await request(table.get(saveId)),now=Date.now();
    if(old&&old.owner!==this.owner&&old.expires>now){t.abort();await done.catch(()=>{});throw new Error('another_tab');}
    const token=(old?.token||0)+1;table.put({id:saveId,owner:this.owner,token,expires:now+10000});
    await done;this.saveId=saveId;this.token=token;return token;
  }
  async renew(){
    if(!this.saveId)return false;
    const t=this.db.transaction('leases','readwrite'),done=completed(t),table=t.objectStore('leases'),lease=await request(table.get(this.saveId));
    // Expiry permits takeover, but does not itself prove that another tab took over.
    // Renew atomically only while both owner and fencing token still match.
    if(lease?.owner!==this.owner||lease.token!==this.token){t.abort();await done.catch(()=>{});return false;}
    lease.expires=Date.now()+10000;table.put(lease);await done;return true;
  }
  async save(state){
    const raw=serialize(state),hash=await digest(raw),frozen=JSON.parse(raw),id=this.saveId;
    if(!id)throw new Error('no_write_lease');
    const t=this.db.transaction(['saves','events','leases'],'readwrite'),done=completed(t);
    const lease=await request(t.objectStore('leases').get(id));
    if(lease?.owner!==this.owner||lease.token!==this.token||lease.expires<Date.now()){t.abort();await done.catch(()=>{});throw new Error('stale_write_lease');}
    const saves=t.objectStore('saves'),old=await request(saves.get(id));
    saves.put({id,raw,hash,eventSeq:frozen.eventSeq,updatedAt:Date.now(),previous:old?.raw||null,previousHash:old?.hash||null});
    const events=t.objectStore('events');
    events.delete(IDBKeyRange.bound([id,0],[id,Math.max(0,frozen.eventSeq-256)]));
    for(const event of frozen.recentEvents)events.put({...event,saveId:id});
    lease.expires=Date.now()+10000;t.objectStore('leases').put(lease);await done;
  }
  async release(){
    if(!this.saveId)return;
    const t=this.db.transaction('leases','readwrite'),done=completed(t),table=t.objectStore('leases'),lease=await request(table.get(this.saveId));
    if(lease?.owner===this.owner&&lease.token===this.token){lease.expires=0;table.put(lease);}
    await done;this.saveId=null;this.token=null;
  }
  async backup(raw,kind='v2'){
    const id=`${kind}-${newIdentity()}`,hash=await digest(raw),t=this.db.transaction('migration_backups','readwrite'),done=completed(t);
    t.objectStore('migration_backups').put({id,raw,hash,createdAt:Date.now()});await done;return id;
  }
  async readVerified(record){
    if(await digest(record.raw)!==record.hash)return null;
    return deserialize(record.raw);
  }
  async recoverPrevious(record){
    if(!record.previous||await digest(record.previous)!==record.previousHash)return null;
    return deserialize(record.previous);
  }
  close(){this.db.close();}
}
