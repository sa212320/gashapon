# 把拼好的整台(碗底、軌道、外圈)轉成網站用的網格檔。
#   座標換成遊戲單位:x = 左右、y = 高(碗心最低處 = 0)、z = 前後(前為 +),碗心在原點。
#   每一組各自用「頂點聚類」減面,再拆成不共用頂點的三角形(每個面一個顏色,平塗才有稜角)。
# 檔案格式(little-endian):
#   'SMST' | uint32 版本 | uint32 三角形數 | float32 縮放 | 每個頂點 int16 x,y,z(× 1/縮放)| 每個三角形 uint8 顏色編號
import sys, json, struct, math
import numpy as np
parts=json.load(open(sys.argv[1])); out=sys.argv[2]
K=100/220
def to_game(V):
    return np.c_[V[:,2]*K, (V[:,1]+17.96)*K, (V[:,0]+20)*K]
def cluster(V,T,cell):
    key=np.floor(V/cell).astype(np.int64)
    uniq,inv=np.unique(key,axis=0,return_inverse=True)
    inv=inv.ravel()
    sums=np.zeros((len(uniq),3)); np.add.at(sums,inv,V); cnt=np.bincount(inv,minlength=len(uniq))
    NV=sums/cnt[:,None]
    NT=inv[T]
    ok=(NT[:,0]!=NT[:,1])&(NT[:,1]!=NT[:,2])&(NT[:,0]!=NT[:,2])
    NT=NT[ok]
    # 去掉重複的三角形
    s=np.sort(NT,axis=1); _,idx=np.unique(s,axis=0,return_index=True)
    return NV,NT[np.sort(idx)]
groups={'floor':[],'rail':[],'rim':[]}
for p in parts:
    n=p['name']
    g='floor' if n.startswith('arena') else 'rail' if n.startswith('riel') else 'rim' if n.startswith('ring') else None
    if g: groups[g].append(p)
CELL={'floor':2.0,'rail':0.9,'rim':1.2}
tris=[]; cols=[]
# 顏色編號(畫面那邊照編號給顏色):0 碗底(依頂點高度漸層)、4 軌道頂、5 軌道側、6 外圈頂、7 外圈立面、8 出口內側
for g,ps in groups.items():
    V=[];T=[];off=0
    for p in ps:
        v=to_game(np.array(p['V'])); t=np.array(p['T'])[:,[0,2,1]]   # 換軸 = 鏡射,三角形要反向
        V.append(v); T.append(t+off); off+=len(v)
    V=np.vstack(V); T=np.vstack(T)
    NV,NT=cluster(V,T,CELL[g])
    A=NV[NT[:,0]];B=NV[NT[:,1]];C=NV[NT[:,2]]
    nrm=np.cross(B-A,C-A); ln=np.linalg.norm(nrm,axis=1); keep=ln>1e-6; nrm=nrm[keep]/ln[keep,None]
    A,B,C=A[keep],B[keep],C[keep]
    cen=(A+B+C)/3; up=nrm[:,1]
    if g=='floor':
        c=np.zeros(len(cen),int)   # 碗底:畫面那邊照頂點高度上漸層
    elif g=='rail':
        c=np.where(up>0.7,4,5)
    else:
        r=np.hypot(cen[:,0],cen[:,2]); low=cen[:,1]<5.0
        # 出口內側:只有朝上的底面才塗深色;立面一律是牆色
        c=np.where(low&(r>60)&(up>0.5),8,np.where(up>0.7,6,7))
    tris.append(np.stack([A,B,C],1)); cols.append(c)
    print(g,'tris',len(A))
P=np.vstack(tris); Cc=np.concatenate(cols).astype(np.uint8)
scale=1/100.0   # int16 存 0.01 單位
q=np.round(P.reshape(-1,3)/scale).astype(np.int16)
with open(out,'wb') as f:
    f.write(b'SMST'); f.write(struct.pack('<IIf',1,len(P),scale)); f.write(q.tobytes()); f.write(Cc.tobytes())
print('total tris',len(P),'bytes',4+12+q.nbytes+Cc.nbytes, 'bbox',P.reshape(-1,3).min(0).round(1),P.reshape(-1,3).max(0).round(1))
