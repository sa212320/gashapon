import sys,json,math
import numpy as np
src=open('register.py').read().split("for p in P: p['F']=faces")[0]
exec(src.replace("parts=json.load(open(sys.argv[1])); out=sys.argv[2]; ONLY=tuple(sys.argv[3].split(',')) if len(sys.argv)>3 else ('',)","parts=json.load(open(sys.argv[1])); out=None; ONLY=('',)"))
r=json.load(open(sys.argv[2])); V=np.array(r['V']); T=np.array(r['T'])
nA=len(P[3]['V'])
FA=faces(V[:nA],T[:len(P[3]['T'])],300)
sym=[f for f in FA if abs(f['A']-3127)<60][0]
ns=sym['n']; cs=sym['c']
print('sym normal',ns.round(3),'centroid',cs.round(1))
h=np.array([0,0,1.0]); print('dot(ns,h)',round(float(ns@h),3))
# plan axes: u = ns (-> stadium z), h -> stadium y, w = h x ns (-> stadium x)
w=np.cross(h,ns)
best=None
for sh in (1,-1):
  for sw in (1,-1):
    H=sh*h; W=sw*np.cross(H,ns)
    # coordinates in stadium frame before translation: x=W, y=H, z=ns
    X=(V-cs)@W; Y=(V-cs)@H; Z=(V-cs)@ns
    # inner edge of the arc: for each z-slice, the min x among points with y near the low band
    # fit circle to points (X,Z) of the lowest layer
    sel=Y<Y.min()+3
    px=X[sel]; pz=Z[sel]
    # Kasa fit
    A=np.c_[2*px,2*pz,np.ones(len(px))]; b=px**2+pz**2
    cx,cz,c=np.linalg.lstsq(A,b,rcond=None)[0]; R=math.sqrt(c+cx*cx+cz*cz)
    print('sh',sh,'sw',sw,'circle centre',round(cx,1),round(cz,1),'R',round(R,1),'X range',round(X.min()),round(X.max()),'Y',round(Y.min()),round(Y.max()))

H=h; Wd=np.cross(H,ns)
X=(V-cs)@Wd; Y=(V-cs)@H; Z=(V-cs)@ns
pts=np.c_[X,Z]
best=(0,None)
for R0 in np.arange(158,182,1.0):
    for cx in np.arange(-260,260,4.0):
        for cz in (0.0,):   # 對稱面在 z=0,圓心一定在對稱面上
            d=np.hypot(pts[:,0]-cx,pts[:,1]-cz)
            if (d<R0-0.8).mean()>0.002: continue
            near=((d>=R0-0.8)&(d<R0+2)).sum()
            if near>best[0]: best=(near,(R0,cx,cz))
print('inner-arc circle (R, cx, cz):',best)

R0,cx,cz=best[1]
Xs=X-cx-20.0; Ys=Y-Y.min()-30.0; Zs=Z
Vst=np.c_[Xs,Ys,Zs]
full=json.load(open(sys.argv[3]))
full.append({'name':'ring (4) xtreme','off':[0,0,0],'V':Vst.tolist(),'T':T.tolist(),'placed':True})
json.dump(full,open(sys.argv[4],'w'))
print('placed bbox',Vst.min(0).round(),Vst.max(0).round())
