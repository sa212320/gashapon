import sys, json
import numpy as np
from PIL import Image, ImageDraw
parts=json.load(open(sys.argv[1])); out=sys.argv[2]; want=sys.argv[3].split(','); onlyplaced=len(sys.argv)>4
X0,X1,Z0,Z1=-250,250,-250,250; s=1.2
W=int((X1-X0)*s); H=int((Z1-Z0)*s)
hm=np.full((H,W),-1e9); col=np.zeros((H,W,3),np.uint8)
pal=[(230,80,80),(80,200,80),(80,120,240),(230,200,60),(200,80,200),(60,200,200),(240,140,40),(150,150,150),(255,255,255),(120,60,20),(0,140,90),(140,0,60)]
labels=[]
k=0
for i,p in enumerate(parts):
    if not any(p['name'].startswith(w) for w in want): continue
    if onlyplaced and not p.get('placed',True): continue
    V=np.array(p['V']); T=np.array(p['T'])
    c=(110,150,210) if p['name'].startswith('arena') else (150,60,190) if p['name'].startswith('riel') else pal[k%len(pal)]
    if not p['name'].startswith(('arena','riel')): labels.append((i,p['name'],c,V[:,0].mean(),V[:,2].mean())); k+=1
    for a,b,cc in T:
        A,B,C=V[a],V[b],V[cc]
        n=max(2,int(max(abs(A[0]-B[0]),abs(A[2]-B[2]),abs(A[0]-C[0]),abs(A[2]-C[2]))*s)+1)
        u=np.linspace(0,1,n+1)
        for uu in u:
            vv=np.linspace(0,1-uu,max(2,int((1-uu)*n)+1))
            ww=1-uu-vv
            P=A[None,:]*uu+B[None,:]*vv[:,None]+C[None,:]*ww[:,None]
            px=((P[:,0]-X0)*s).astype(int); pz=((P[:,2]-Z0)*s).astype(int)
            m=(px>=0)&(px<W)&(pz>=0)&(pz<H)
            for x,z,y in zip(px[m],pz[m],P[m,1]):
                if y>hm[z,x]: hm[z,x]=y; col[z,x]=c
im=Image.fromarray(col); d=ImageDraw.Draw(im)
for i,nm,c,mx,mz in labels: d.text(((mx-X0)*s,(mz-Z0)*s),f"{i}",fill=(0,0,0))
im.save(out); print(labels and [(l[0],l[1]) for l in labels])
