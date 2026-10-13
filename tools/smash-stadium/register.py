# 用「切面形狀相同」把沒有位置的零件一塊塊接回已知位置的零件上。
import sys, json, math
import numpy as np
parts=json.load(open(sys.argv[1])); out=sys.argv[2]; ONLY=tuple(sys.argv[3].split(',')) if len(sys.argv)>3 else ('',)
P=[]
for p in parts:
    V=np.array(p['V'],float); T=np.array(p['T'],int)
    P.append({'name':p['name'],'V':V,'T':T,'placed': p.get('placed', p['name'].startswith(('arena','riel')) or p['name']=='ring')})

def faces(V,T,min_area=150):
    a=V[T[:,0]]; b=V[T[:,1]]; c=V[T[:,2]]
    n=np.cross(b-a,c-a); ar=np.linalg.norm(n,axis=1)/2; ok=ar>1e-9
    n[ok]/= (2*ar[ok])[:,None]
    d=np.einsum('ij,ij->i',n,a)
    groups={}
    for i in np.nonzero(ok)[0]:
        key=(tuple(np.round(n[i]*40).astype(int)),int(round(d[i]*2)))
        groups.setdefault(key,[]).append(i)
    F=[]
    for key,idx in groups.items():
        A=ar[idx].sum()
        if A<min_area: continue
        idx=np.array(idx); vid=np.unique(T[idx].ravel()); pts=V[vid]
        nn=n[idx].mean(0); nn/=np.linalg.norm(nn)
        cen=(((a[idx]+b[idx]+c[idx])/3)*ar[idx][:,None]).sum(0)/A
        F.append({'n':nn,'c':cen,'A':A,'pts':pts})
    return F

def frame(n):
    u=np.array([1,0,0.]) if abs(n[0])<0.9 else np.array([0,1,0.])
    e1=np.cross(n,u); e1/=np.linalg.norm(e1); e2=np.cross(n,e1); return e1,e2

def candidates(fp,fq):
    # 旋轉:把 fp 的法線轉到 -fq 的法線,平面內的角度從「最遠頂點」配對猜
    e1p,e2p=frame(fp['n']); nq=-fq['n']; e1q,e2q=frame(nq)
    Fp=np.stack([e1p,e2p,fp['n']],1); 
    rp=fp['pts']-fp['c']; dp=np.linalg.norm(rp,axis=1); far=rp[np.argmax(dp)]
    ap=math.atan2(far@e2p,far@e1p)
    rq=fq['pts']-fq['c']; dq=np.linalg.norm(rq,axis=1)
    out=[]
    for j in np.nonzero(abs(dq-dp.max())<1.0)[0]:
        aq=math.atan2(rq[j]@e2q,rq[j]@e1q)
        for mirror in (1,):
            th=aq-ap
            # 在 q 的平面框架裡轉 th
            c,s=math.cos(th),math.sin(th)
            g1=c*e1q+s*e2q; g2=-s*e1q+c*e2q
            Fq=np.stack([g1,g2,nq],1)
            R=Fq@Fp.T
            if np.linalg.det(R)<0: continue
            t=fq['c']-R@fp['c']
            out.append((R,t))
    return out

RAIL=[165.0,165.2,165.9,166.8,168.2,169.5,171.5,173.6,175.7,178.5,181.4,184.4,187.8,191.2,194.2,196.7,198.7,199.7,200.0,199.8,198.9,197.2,195.3,193.4,191.3,190.2,189.3,189.3,189.8,190.4,190.9,190.7,187.9,179.9,178.6,145.5,145.2]
def rail_r(x,z):
    a=abs(math.degrees(math.atan2(z,x+20.0)))/5; i=min(35,int(a)); t=a-i
    return RAIL[i]*(1-t)+RAIL[i+1]*t
def valid(V):
    if V[:,1].min()<-80 or V[:,1].max()>200: return False
    if V[:,0].min()<-250 or V[:,0].max()>275 or V[:,2].min()<-250 or V[:,2].max()>250: return False
    sub=V[::7]
    inside=0
    for x,y,z in sub:
        if y>-2 and math.hypot(x+20.0,z)<rail_r(x,z)-6: inside+=1
    return inside<=0.01*len(sub)

def overlaps(V, others):
    sub=V[::5]
    for Q in others:
        lo=Q.min(0)-1; hi=Q.max(0)+1
        m=sub[np.all((sub>lo)&(sub<hi),axis=1)]
        if len(m)==0: continue
        d=np.min(np.linalg.norm(m[:,None,:]-Q[None,::2,:],axis=2),axis=1)
        if (d<0.8).sum()>0.3*len(sub): return True
    return False

def hug(V):
    # 零件最靠內的那一圈離軌道外緣多遠(越小越貼)
    sub=V[(V[:,1]>-8)&(V[:,1]<8)][::3]
    if len(sub)==0: return 99
    gaps=[math.hypot(x+20.0,z)-rail_r(x,z) for x,y,z in sub]
    return abs(min(gaps))

def score(R,t,fp,fq):
    m=(R@fp['pts'].T).T+t
    d=np.min(np.linalg.norm(m[:,None,:]-fq['pts'][None,:,:],axis=2),axis=1)
    return (d<0.6).mean()

for p in P: p['F']=faces(p['V'],p['T'])
changed=True; it=0
while changed and it<40:
    changed=False; it+=1
    for p in P:
        if p['placed'] or not p['name'].startswith(ONLY): continue
        best=(0,None,None,99)
        for q in P:
            if not q['placed']: continue
            for fp in p['F']:
                for fq in q['F']:
                    if abs(fp['A']-fq['A'])>0.03*max(fp['A'],fq['A']): continue
                    if abs(len(fp['pts'])-len(fq['pts']))>max(4,0.2*len(fq['pts'])): continue
                    for R,t in candidates(fp,fq):
                        s=score(R,t,fp,fq)
                        if s>best[0] and s>0.85:
                            Vt=(R@p['V'].T).T+t
                            if valid(Vt) and not overlaps(Vt,[o['V'] for o in P if o['placed'] and o is not q]):
                                h=hug(Vt)
                                if s>best[0]+0.02 or h<best[3]: best=(s,(R,t),q['name'],h)
        if best[0]>0.85:
            R,t=best[1]; p['V']=(R@p['V'].T).T+t; p['placed']=True; p['F']=faces(p['V'],p['T']); changed=True
            print(f"placed {p['name']:14s} via {best[2]:14s} score {best[0]:.2f} hug {best[3]:.1f}")
print('unplaced:',[p['name'] for p in P if not p['placed']])
json.dump([{'name':p['name'],'off':[0,0,0],'V':p['V'].tolist(),'T':p['T'].tolist(),'placed':p['placed']} for p in P],open(out,'w'))
