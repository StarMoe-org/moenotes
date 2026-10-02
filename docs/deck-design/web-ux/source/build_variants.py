import json,re,os
V=[("01-goal-ready","Goal",{}),("02-goal-signed-out","Goal",{"boxState":"signedOut"}),("03-goal-local","Goal",{"boxState":"local"}),("04-goal-no-game-account","Goal",{"boxState":"noGameAccount"}),
("05-constraints","Constraints",{}),("06-skills","Skills",{}),("07-result-done","Main",{}),("08-result-searching","Main",{"resultState":"searching"}),
("09-result-stale","Main",{"resultState":"stale"}),("10-result-range","Main",{"resultState":"range"}),("11-result-dark","Main",{"theme":"dark"}),
("12-goal-mobile","GoalMobile",{"boxState":"signedOut"}),("13-skills-mobile","SkillsMobile",{}),("14-result-mobile","Mobile",{}),
("20-box-account","Box",{}),("21-box-local","Box",{"storage":"local"}),("22-box-setup-account","BoxSetup",{}),("23-box-setup-signed-out","BoxSetup",{"mode":"signedOut"}),
("24-box-setup-mobile-upload","BoxSetupMobile",{}),("25-box-setup-mobile-done","BoxSetupMobile",{"phase":"done"}),("26-card-edit","CardEdit",{}),("27-login-merge","LoginMerge",{})]
man=[]
for name,src,ov in V:
    s=open(f'project/{src}.dc.html',encoding='utf-8').read()
    m=re.search(r"data-props='([^']*)'",s); props=json.loads(m.group(1))
    for k,v in ov.items(): props[k]['default']=v
    s=s[:m.start(1)]+json.dumps(props,ensure_ascii=False)+s[m.end(1):]
    open(f'render/site/{name}.dc.html','w',encoding='utf-8').write(s)
    man.append({"name":name,"src":src,"variant":ov,"width":props['$preview']['width'],"height":props['$preview']['height']})
json.dump(man,open('render/manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
