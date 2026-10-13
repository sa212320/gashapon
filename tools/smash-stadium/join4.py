import sys,json,math
import numpy as np
src=open('register.py').read().split("for p in P: p['F']=faces")[0]
exec(src.replace("parts=json.load(open(sys.argv[1])); out=sys.argv[2]; ONLY=tuple(sys.argv[3].split(',')) if len(sys.argv)>3 else ('',)","parts=json.load(open(sys.argv[1])); out=None; ONLY=('',)"))
A=P[3]; B=P[36]
FA=faces(A['V'],A['T'],300); FB=faces(B['V'],B['T'],300)
res=[]
for fb in FB:
    for fa in FA:
        if abs(fa['A']-fb['A'])>0.03*fa['A'] or fa['A']<2000: continue
        for R,t in candidates(fb,fa):
            s=score(R,t,fb,fa)
            if s<0.6: continue
            VB=(R@B['V'].T).T+t
            # 兩塊不能互相重疊:B 的點離 A 的點很近的比例(扣掉接合面)
            sub=VB[::3]
            d=np.min(np.linalg.norm(sub[:,None,:]-A['V'][None,::2,:],axis=2),axis=1)
            res.append((round(s,2),round(fa['A']),round((d<0.8).mean(),2),R,t))
res.sort(key=lambda r:(r[2],-r[0]))
for r in res[:6]: print(r[:3])
R,t=res[0][3],res[0][4]
VB=(R@B['V'].T).T+t
V=np.vstack([A['V'],VB]); T=np.vstack([A['T'],B['T']+len(A['V'])])
json.dump({'V':V.tolist(),'T':T.tolist()},open(sys.argv[2],'w'))
print('joined bbox',V.min(0).round(),V.max(0).round())
