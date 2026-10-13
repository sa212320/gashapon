# 簡單的 z-buffer 渲染:從前上方斜看,平面光照,零件各自上色
import sys, json, math
import numpy as np
from PIL import Image
parts=json.load(open(sys.argv[1])); out=sys.argv[2]
yaw=math.radians(float(sys.argv[3]) if len(sys.argv)>3 else 0); pitch=math.radians(float(sys.argv[4]) if len(sys.argv)>4 else 40)
W,H=900,700; S=1.6
pal=[(230,80,80),(80,200,80),(80,120,240),(230,200,60),(200,80,200),(60,200,200),(240,140,40),(170,170,170),(250,250,250),(150,90,40),(0,160,110),(160,0,70)]
zb=np.full((H,W),np.inf); img=np.zeros((H,W,3)); img[:]=(25,25,30)
light=np.array([0.3,0.8,0.5]); light/=np.linalg.norm(light)
k=0
for p in parts:
    V=np.array(p['V'],float); T=np.array(p['T'],int)
    V=V-np.array([-20,0,0])   # 碗心當中心
    # 視角:先繞 y 轉 yaw,再往下俯 pitch;鏡頭看 -z 方向。前側(+x)朝向鏡頭
    x,y,z=V[:,2],V[:,1],V[:,0]   # 讓 +x(前)變成朝鏡頭的 z
    cy,sy=math.cos(yaw),math.sin(yaw)
    x,z=x*cy+z*sy,-x*sy+z*cy
    cp,sp=math.cos(pitch),math.sin(pitch)
    y,z=y*cp-z*sp,y*sp+z*cp
    P=np.c_[W/2+x*S,H/2-y*S,-z]
    name=p['name']
    base=(110,150,210) if name.startswith('arena') else (150,60,190) if name.startswith('riel') else pal[k%len(pal)]
    if not name.startswith(('arena','riel')): k+=1
    A=P[T[:,0]];B=P[T[:,1]];C=P[T[:,2]]
    Vw=np.array(p['V'],float); n=np.cross(Vw[T[:,1]]-Vw[T[:,0]],Vw[T[:,2]]-Vw[T[:,0]]); n/=np.linalg.norm(n,axis=1)[:,None]+1e-12
    shade=0.35+0.65*np.abs(n@np.array([light[2],light[1],light[0]]))
    for i in range(len(T)):
        a,b,c=A[i],B[i],C[i]
        x0=int(max(0,min(a[0],b[0],c[0]))); x1=int(min(W-1,max(a[0],b[0],c[0]))+1)
        y0=int(max(0,min(a[1],b[1],c[1]))); y1=int(min(H-1,max(a[1],b[1],c[1]))+1)
        if x1<=x0 or y1<=y0: continue
        xs,ys=np.meshgrid(np.arange(x0,x1),np.arange(y0,y1))
        d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(d)<1e-9: continue
        l1=((b[1]-c[1])*(xs-c[0])+(c[0]-b[0])*(ys-c[1]))/d
        l2=((c[1]-a[1])*(xs-c[0])+(a[0]-c[0])*(ys-c[1]))/d
        l3=1-l1-l2
        m=(l1>=0)&(l2>=0)&(l3>=0)
        if not m.any(): continue
        zz=l1*a[2]+l2*b[2]+l3*c[2]
        sub=zb[y0:y1,x0:x1]; upd=m&(zz<sub)
        sub[upd]=zz[upd]
        img[y0:y1,x0:x1][upd]=np.array(base)*shade[i]
Image.fromarray(img.clip(0,255).astype(np.uint8)).save(out)
