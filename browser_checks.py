from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time,traceback,base64,shutil
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'qa-output'; OUT.mkdir(exist_ok=True)
original=(ROOT/'app.js').read_text()
configured_mode=[False]
configured=original.replace('const AGREEMENT_URL = "#";','const AGREEMENT_URL = "https://example.com/agreement";').replace('PASTE_WEB_APP_URL_HERE','https://script.google.com/macros/s/TEST/exec')
doc=BeautifulSoup((ROOT/'index.html').read_text(),'html.parser')
for el in doc.select('meta[http-equiv="Content-Security-Policy"],script,link[rel="stylesheet"]'):el.decompose()
style=doc.new_tag('style');style.string=(ROOT/'styles.css').read_text();doc.head.append(style)
for el in doc.select('img[src]'):
 path=ROOT/el['src'];el['src']='data:image/svg+xml;base64,'+base64.b64encode(path.read_bytes()).decode()
test_html=str(doc)
reply={'ok':False,'errors':['Example server rejection']}
results=[]
def record(name,fn):
 try: fn(); results.append({'test':name,'status':'passed'}); print('PASS',name,flush=True)
 except Exception as e: results.append({'test':name,'status':'failed','error':str(e)}); print('FAIL',name,str(e)[:500],flush=True); traceback.print_exc()
def check(x,msg):
 if not x: raise AssertionError(msg)
URL='http://127.0.0.1:8765/'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 errors=[]
 page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
 def load():
  page.goto('about:blank');page.set_content(test_html)
  page.add_script_tag(content=configured if configured_mode[0] else original)
  page.wait_for_selector('#application-fields:enabled')
  page.evaluate("""(reply)=>{window.__requests=[];window.__reply=reply;window.fetch=async(url,opts)=>{window.__requests.push({headers:{'content-type':opts.headers['Content-Type']},payload:JSON.parse(opts.body)});return new Response(JSON.stringify(window.__reply),{status:200,headers:{'Content-Type':'application/json'}})}}""", reply)
 def fill(name,value):page.locator('[name="'+name+'"]').fill(value)
 def force(name,value):
  page.locator('[name="'+name+'"]').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}',value)
 def radio(name,value):page.locator('input[name="'+name+'"][value="'+value+'"]').check()
 def next_():page.locator('#next-button').click()
 def step(n):check(page.locator('#step-'+str(n)).is_visible(),'not on step '+str(n))
 def applicant(owner='Yes',business='Restaurant'):
  fill('applicant_first_name','Joël');fill('applicant_last_name','Kofie')
  fill('applicant_email','joel.test+partner@example.com');fill('applicant_phone','(212) 555-0100')
  fill('mailing_address_line1','100 Example Avenue');fill('mailing_address_line2','Apt 2B');fill('mailing_city','New York')
  page.select_option('#mailing_state','NY');fill('mailing_zip','10027')
  radio('is_owner',owner)
  if owner=='No':
   fill('owner_first_name','Amélie');fill('owner_last_name',"O’Neill-Sow");fill('owner_phone','+1 718 555 0134');fill('owner_email','owner@example.com')
  radio('business_type',business)
 def business(grocery=False,alcohol=False):
  fill('business_name','Example Market 24');fill('business_email','store@example.com');fill('business_phone','7185550133')
  fill('business_address_line1','20 Test Street');fill('business_city','New York');page.select_option('#business_state','NY');fill('business_zip','10027-1234')
  page.select_option('#category','African Grocery Store' if grocery else 'African');fill('category_detail','Ghanaian')
  radio('order_types','Delivery and Pickup');radio('equipment_needed','No');radio('sells_alcohol','Yes' if alcohol else 'No')
  if alcohol: page.check('#liquor_license_confirmed')
 def upload(name,count=1):
  page.locator('#'+name).set_input_files([{'name':f'{name}-{i}.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\nSynthetic test only\n%%EOF'} for i in range(count)])
  page.wait_for_function('(n)=>!Array.from(document.querySelectorAll("#"+n+"-list .file-status")).some(e=>e.textContent.includes("Preparing"))',arg=name)
 def review(owner='Yes',grocery=False):
  applicant(owner,'Grocery Store' if grocery else 'Restaurant');next_();business(grocery);next_();next_();next_();upload('owner_id');upload('permits',2);fill('ein','12-3456789');next_();step(6)
 def initial():
  load();check(not errors, str(errors));check(page.locator('#mailing_state option').count()==51,'50 states missing');check(page.locator('#business_state option').count()==51,'business states missing')
  check(page.locator('.welcome,.benefits,.prepare-note,.contact-line').count()==0,'marketing remains')
  check(page.locator('#applicant_first_name').bounding_box()['y']<320,'fields not high enough')
  check(page.locator('.honeypot').bounding_box()['width']==1,'honeypot visible')
 record('Compact first screen, 50 states, no marketing, no script errors',initial)
 page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
 def required():
  next_();step(1);check(page.locator('#applicant_first_name').get_attribute('aria-invalid')=='true','required validation missing');check(page.evaluate('document.activeElement.id')=='applicant_first_name','focus error')
 record('Required fields and error focus',required)
 def typing():
  fill('applicant_first_name','Anna');page.locator('#applicant_first_name').press('1');check(page.locator('#applicant_first_name').input_value()=='Anna','name digit accepted')
  fill('applicant_phone','2125550100');page.locator('#applicant_phone').press('a');check(page.locator('#applicant_phone').input_value()=='2125550100','phone letter accepted')
 record('Reject typed digits in names and typed letters in phones',typing)
 def invalid():
  load();applicant()
  for field,tests in [('applicant_first_name',['1234','Anna123','john@example.com','<script>']),('applicant_email',['2125550100','user','a@@example.com','a@example','a@.com','a..b@example.com','a@example..com','a@-example.com']),('applicant_phone',['name@example.com','212abc0100','123','1111111111','2125550100 ext 20']),('mailing_zip',['123','ABCDE','1234567890']),('mailing_city',['12345','city@example.com']),('mailing_address_line1',['2125550100','mail@example.com'])]:
   old=page.locator('[name="'+field+'"]').input_value()
   for v in tests:
    force(field,v);page.locator('#next-button').evaluate('(el)=>el.click()');step(1);check(page.locator('#'+field+'-error').is_visible(),f'bad {field} accepted: {v}')
   force(field,old)
  next_();step(2)
 record('Name/email/phone/address/ZIP invalid-input matrix and final step validation',invalid)
 def restaurant():
  load();applicant();next_()
  check(page.inner_text('#step-2-title')=='Restaurant information','restaurant heading')
  check(page.locator('#category option').all_text_contents()==['Select cuisine type','African','Caribbean','Other'],'wrong restaurant options')
  business();next_();step(3)
 record('Restaurant-only path and valid business details',restaurant)
 def ownership():
  load();applicant('No');page.locator('[name="owner_email"]').fill('');next_();step(1)
  check(page.locator('#owner_email-error').is_visible(),'owner email not required')
  radio('is_owner','Yes');check(page.locator('#owner-fields').is_hidden(),'owner fields not hidden');next_();step(2)
 record('Non-owner details required, owner Yes hides and disables them',ownership)
 def groceryswitch():
  business();page.locator('#back-button').click();radio('business_type','Grocery Store');next_();step(2)
  check(page.locator('#category').input_value()=='','old category retained');check(page.locator('#category_detail').input_value()=='','old detail retained')
  check(page.inner_text('#step-2-title')=='Grocery store information','wrong path title')
  check(page.locator('#category option').all_text_contents()==['Select grocery store type','African Grocery Store','Caribbean Grocery Store','Other'],'wrong grocery options')
  business(True,True);page.uncheck('#liquor_license_confirmed');next_();step(2);check(page.locator('#liquor_license_confirmed-error').is_visible(),'liquor confirmation skipped')
  radio('sells_alcohol','No');check(page.locator('#alcohol-fields').is_hidden(),'hidden alcohol');next_();step(3)
 record('Grocery-only path, switching resets category, conditional alcohol check',groceryswitch)
 def uploads():
  next_();step(4);next_();step(5);next_();step(5)
  upload('owner_id');upload('permits',5);fill('ein','123456789');next_();step(6)
  check('Example Market 24' in page.inner_text('#review-summary'),'review business missing')
 record('Optional images, mandatory documents, permit counts, EIN and review',uploads)
 def placeholder():
  page.check('#agreement_accepted');page.check('#permits_confirmed');page.locator('#submit-button').click()
  check(page.locator('#submission-error').is_visible(),'placeholder allowed submission');check('not open' in page.inner_text('#submission-errors'),'configuration message missing')
 record('Unconfigured endpoint/agreement blocks sending; no false success',placeholder)
 # Configure only served test JS; shipped files keep placeholders.
 configured_mode[0]=True
 def submission():
  load();review('No',True);page.check('#agreement_accepted');page.check('#permits_confirmed');page.locator('#submit-button').click();page.wait_for_selector('#submission-error:not([hidden])')
  check('Example server rejection' in page.inner_text('#submission-errors'),'failure missing');check(page.locator('#business_email').input_value()=='store@example.com','data lost')
  capture=page.evaluate('window.__requests.at(-1)');payload=capture['payload'];expected='applicant_name applicant_email applicant_phone mailing_address is_owner owner_name owner_phone owner_email business_type business_name business_email business_phone business_address category category_detail order_types equipment_needed sells_alcohol liquor_license_confirmed ein plan agreement_accepted permits_confirmed website files'.split()
  check(set(payload)==set(expected),'payload keys changed: '+str(set(payload)^set(expected)))
  check(payload['applicant_name']=='Joël Kofie','name compose');check(payload['owner_name']=='Amélie O’Neill-Sow','owner name')
  check(payload['mailing_address']=='100 Example Avenue\nApt 2B\nNew York, NY 10027','address compose')
  check(payload['applicant_phone']=='+12125550100','normalization');check(payload['business_address']=='20 Test Street\nNew York, NY 10027-1234','business address compose')
  check(capture['headers']['content-type']=='text/plain;charset=utf-8','wrong contenttype')
  check(len(payload['files']['permits'])==2 and not payload['files']['permits'][0]['data'].startswith('data:'),'file payload')
  check(page.locator('#owner-consent-review').is_visible(),'consent review absent')
 record('Exact API contract, joined names/addresses, normalized phones, retained data on failure',submission)
 def success():
  reply.update({'ok':True,'applicationId':'AFT-TEST-001','ownerConsent':{'status':'sent','email':'owner@example.com'}})
  page.evaluate('(r)=>{window.__reply=r}',reply);page.locator('#submit-button').click();page.wait_for_selector('#success-screen:not([hidden])')
  check('AFT-TEST-001' in page.inner_text('#success-message'),'missing ID');check('store@example.com' in page.inner_text('#success-message'),'business email')
  check('consent email was sent' in page.inner_text('#owner-consent-status'),'acknowledgement missing')
  check(page.locator('#partner-form input').count()==0,'sensitive values retained')
 record('Success screen and confirmed-only owner email status, sensitive memory cleared',success)
 def unconfirmed():
  load();review('No');page.check('#agreement_accepted');page.check('#permits_confirmed')
  reply.clear();reply.update({'ok':True,'applicationId':'AFT-TEST-002'})
  page.evaluate('(r)=>{window.__reply=r}',reply);page.locator('#submit-button').click();page.wait_for_selector('#success-screen:not([hidden])')
  check('sent' not in page.inner_text('#owner-consent-status'),'false email-sent claim')
 record('No email-sent claim when backend does not confirm delivery',unconfirmed)
 def upload_regressions():
  load();applicant();next_();business();next_();next_();step(4)
  encoded=page.evaluate('''()=>{let c=document.createElement('canvas');c.width=4096;c.height=2048;let x=c.getContext('2d');x.fillStyle='#F84803';x.fillRect(0,0,4096,2048);return c.toDataURL('image/png').split(',')[1]}''')
  page.locator('#logo').set_input_files({'name':'synthetic.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
  page.wait_for_function('document.querySelector("#logo-list").textContent.includes("2000 × 1000")')
  page.locator('#cover').set_input_files({'name':'large.pdf','mimeType':'application/pdf','buffer':b'%PDF-'+b'0'*(8*1024*1024)})
  page.wait_for_function('document.querySelector("#cover-list").textContent.includes("over 8 MB")')
  next_();step(4);check(page.locator('#cover-error').is_visible(),'oversize optional file passed')
  page.locator('#cover-list .file-remove').click()
  page.locator('#cover').set_input_files({'name':'unsupported.svg','mimeType':'image/svg+xml','buffer':b'<svg></svg>'})
  page.wait_for_function('document.querySelector("#cover-list .is-error") !== null')
  page.locator('#cover-list .file-remove').click();next_();step(5)
  upload('owner_id');upload('permits',5)
  page.locator('#permits').set_input_files({'name':'sixth.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n%%EOF'})
  check('no more than 5' in page.inner_text('#permits-error'),'sixth permit not rejected')
  check(page.locator('#permits-list li').count()==5,'count changed on rejected batch')
 record('4096px PNG downsizes to 2000px, oversized PDF and unsupported file rejected, 5 permits enforced',upload_regressions)
 def duplicate():
  load();review('Yes');page.check('#agreement_accepted');page.check('#permits_confirmed')
  page.evaluate('''()=>{window.__sendCount=0;window.fetch=async()=>{window.__sendCount++;return await new Promise(resolve=>{window.__resolveSend=()=>resolve(new Response(JSON.stringify({ok:true,applicationId:'AFT-TEST-003'}),{status:200}))})}}''')
  page.locator('#submit-button').click();page.wait_for_function('window.__sendCount===1')
  check(page.locator('#submit-button').is_disabled(),'submit not disabled')
  page.evaluate('document.querySelector("#partner-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
  check(page.evaluate('window.__sendCount')==1,'duplicate sent')
  page.evaluate('window.__resolveSend()');page.wait_for_selector('#success-screen:not([hidden])')
  check(page.locator('#owner-consent-status').is_hidden(),'owner path showed consent email status')
 record('In-flight submit lock prevents duplicate sends; owner path skips consent notice',duplicate)
 def layouts():
  for w in [320,360,390,430,768,1024,1440]:
   page.set_viewport_size({'width':w,'height':900});load();applicant('No');
   for n in range(1,7):
    step(n)
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),f'overflow width {w} step {n}')
    if n==1:next_()
    elif n==2:business();next_()
    elif n in [3,4]:next_()
    elif n==5:upload('owner_id');upload('permits');fill('ein','123456789');next_()
   if w==390:page.screenshot(path=str(OUT/'review.png'),full_page=True)
  check(not errors,'JS errors '+str(errors))
 record('All six steps at 320–1440 pixels with no page overflow or JS errors',layouts)
 page.set_viewport_size({'width':1440,'height':1100});load();page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});load();page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
 # static checks meaningful labels and unique ids
 def a11y():
  ids=page.locator('[id]').evaluate_all('(els)=>els.map(e=>e.id)');check(len(ids)==len(set(ids)),'duplicate IDs')
  check(page.evaluate('Array.from(document.querySelectorAll("input:not([type=hidden]),select,textarea")).every(el=>el.labels && el.labels.length)'), 'unlabelled input')
  check(page.evaluate('Array.from(document.querySelectorAll("[aria-describedby]")).every(el=>el.getAttribute("aria-describedby").split(/\\s+/).every(id=>document.getElementById(id)))'),'broken descriptions')
 record('Explicit labels, unique IDs, all aria-describedby references resolve',a11y)
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
print('SUMMARY',sum(x['status']=='passed' for x in results),'/',len(results))

if any(item["status"] != "passed" for item in results):
 raise SystemExit(1)
