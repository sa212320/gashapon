# 整台的頂面高度圖(遊戲單位,碗心為原點,+y = 前)。每格 0.5 單位。
import sys, json, math
import numpy as np
from PIL import Image
parts=json.load(open(sys.argv[1])); out=sys.argv[2]
K=100/220; RES=0.5; N=int(240/RES)   # -120..120
hm=np.full((N,N),np.nan)
def to_game(V):
    # 物件座標(mm):x = 前後(前為 +),z = 左右,y = 高。碗心在 (-20, *, 0),碗底最低 -17.96
    X=V[:,2]*K; Y=(V[:,0]+20)*K; H=(V[:,1]+17.96)*K
    return X,Y,H
for p in parts:
    if not p['name'].startswith(('arena','riel','ring')): continue
    V=np.array(p['V']); T=np.array(p['T'])
    X,Y,H=to_game(V)
    for a,b,c in T:
        xs=np.array([X[a],X[b],X[c]]); ys=np.array([Y[a],Y[b],Y[c]]); hs=np.array([H[a],H[b],H[c]])
        n=max(2,int(max(np.ptp(xs),np.ptp(ys))/RES*1.5)+1)
        u=np.linspace(0,1,n+1); U,Vv=np.meshgrid(u,u); m=U+Vv<=1; U=U[m]; Vv=Vv[m]; Wt=1-U-Vv
        px=((U*xs[0]+Vv*xs[1]+Wt*xs[2]+120)/RES).astype(int); py=((U*ys[0]+Vv*ys[1]+Wt*ys[2]+120)/RES).astype(int)
        ph=U*hs[0]+Vv*hs[1]+Wt*hs[2]
        ok=(px>=0)&(px<N)&(py>=0)&(py<N)
        for x,y,h in zip(px[ok],py[ok],ph[ok]):
            if not (hm[y,x]>=h): hm[y,x]=h
np.save(out,hm)
lo,hi=np.nanmin(hm),np.nanmax(hm); print('height range',round(lo,2),round(hi,2))
img=np.zeros((N,N,3),np.uint8)
v=(hm-lo)/(hi-lo); ok=~np.isnan(hm)
img[ok]=np.stack([v[ok]*255,v[ok]*255,255-v[ok]*200],1).astype(np.uint8)
Image.fromarray(img[::-1]).resize((N*2,N*2)).save(out.replace('.npy','.png'))
