const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto');
const source = fs.readFileSync(require('path').join(__dirname, '../integration/OwnerConsent.gs'),'utf8');
let calls=[];let quota=10;let throwSend=false;let properties=new Map([['OWNER_CONSENT_REPLY_TO','support@afritogo.com']]);
const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,str)=>Array.from(crypto.createHash('sha256').update(str).digest())},
MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:(message)=>{if(throwSend)throw Error('mock failure');calls.push(message);}}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const app={is_owner:'No',applicant_name:'Test Applicant',owner_name:'Test Owner',owner_email:'owner@example.com',business_name:'Example Business',website:''};
function assert(x,m){if(!x)throw Error(m)}
assert(sandbox.requestOwnerConsent('AFT-0001',{...app,is_owner:'Yes'}).status==='not_required','owner branch');
assert(sandbox.requestOwnerConsent('AFT-0002',app).status==='sent','send');assert(calls.length===1,'one send');
assert(sandbox.requestOwnerConsent('AFT-0002',app).status==='sent'&&calls.length===1,'dedup');
assert(calls[0].replyTo==='support@afritogo.com'&&calls[0].to==='owner@example.com','recipient/reply');
assert(!calls[0].attachments && !calls[0].cc && !calls[0].bcc,'no extra disclosures');
quota=0;assert(sandbox.requestOwnerConsent('AFT-0003',app).status==='pending','quota');quota=10;
throwSend=true;assert(sandbox.requestOwnerConsent('AFT-0004',app).status==='pending','failure pending');throwSend=false;
assert(sandbox.requestOwnerConsent('AFT-0004',app).status==='pending'&&calls.length===1,'ambiguous no resend');
let rejected=false;try{sandbox.requestOwnerConsent('AFT-0005',{...app,owner_email:'a@example.com,b@example.com'})}catch(e){rejected=true}assert(rejected,'recipient injection');
console.log('Owner consent helper: All local assertions passed using mocked Google services. No email sent.');
