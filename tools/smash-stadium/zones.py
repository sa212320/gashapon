# 從高度圖產生區域圖(每格 1 單位),輸出成 JS 模組(RLE 字串)。
import sys, math
import numpy as np
hm=np.load(sys.argv[1]); out=sys.argv[2]; RES=0.5
RAIL_OUT=[75.0,75.1,75.4,75.8,76.5,77.1,78.0,78.9,79.9,81.2,82.4,83.8,85.4,86.9,88.3,89.4,90.3,90.8,90.9,90.8,90.4,89.6,88.8,87.9,87.0,86.4,86.0,86.0,86.3,86.6,86.8,86.7,85.5,81.8,81.2,66.2,66.0]
def rail_out(x,y):
    d=abs(math.degrees(math.atan2(y,x))-90); d=360-d if d>180 else d; d/=5
    i=min(len(RAIL_OUT)-2,int(d)); t=min(1,d-i); return RAIL_OUT[i]*(1-t)+RAIL_OUT[i+1]*t
def h(x,y):
    # 這一格(1×1)裡最高的取樣
    vals=[]
    for dx in (-0.25,0.25):
        for dy in (-0.25,0.25):
            i=int(round((y+dy+120)/RES)); j=int(round((x+dx+120)/RES))
            if 0<=i<hm.shape[0] and 0<=j<hm.shape[1] and not np.isnan(hm[i,j]): vals.append(hm[i,j])
    return max(vals) if vals else float('nan')
X0,X1,Y0,Y1=-101,101,-91,123
# 0 盤外 1 碗(軌道外緣以內) 2 平台 3 邊緣(跳得過) 4 高牆 5 左方槽 6 右方槽 7 中間凹槽 8 柱子
codes=[]
for y in range(Y0,Y1):
    for x in range(X0,X1):
        cx,cy=x+0.5,y+0.5
        if math.hypot(cx,cy)<rail_out(cx,cy): codes.append(1); continue
        v=h(cx,cy)
        if np.isnan(v):
            # 零件接縫的空隙:四周大多有東西就當平台
            around=[h(cx+dx,cy+dy) for dx in (-1.5,0,1.5) for dy in (-1.5,0,1.5)]
            ok=[a for a in around if not np.isnan(a)]
            codes.append(2 if len(ok)>=6 and min(ok)>=5 else 0)
        elif v<5:
            if abs(cx)<32 and 60<cy<90: codes.append(7)
            elif abs(cx)>=56 and cy<102: codes.append(5 if cx<0 else 6)
            else: codes.append(0)
        elif v>=40: codes.append(8)
        elif v>=20: codes.append(4)
        elif v>14: codes.append(3 if abs(cx)>=50 or cy<0 else 4)   # 前方正中那一段的斜面歸給高牆
        else: codes.append(2)
# RLE:每段 = 區域代號(1 字元)+ 長度(base36,用 '.' 結尾)
rle=[]; prev=codes[0]; n=0
for c in codes+[None]:
    if c==prev: n+=1; continue
    rle.append(f"{prev}{np.base_repr(n,36).lower()}."); prev=c; n=1
s=''.join(rle)
W=X1-X0; H=Y1-Y0
with open(out,'w') as f:
    f.write("// 對戰盤的區域圖(自動產生,不要手改)。來源:tools/smash-stadium 從 Nick__Furry 的 Xtreme 盤 3D 檔\n")
    f.write("// (MakerWorld 1147551,CC BY-NC)拼回原位後算的高度圖。每格 1 單位,x 從 %d、y 從 %d,寬 %d 高 %d。\n"%(X0,Y0,W,H))
    f.write("// 區域:0 盤外 1 碗 2 平台 3 方槽邊緣(跳得過) 4 高牆 5 左方槽 6 右方槽 7 中間凹槽 8 柱子\n")
    f.write(f"export const GRID = Object.freeze({{ x0: {X0}, y0: {Y0}, w: {W}, h: {H}, rle: '{s}' }});\n")
import collections
print('cells',len(codes),'rle chars',len(s),collections.Counter(codes))
# 預覽
from PIL import Image
pal={8:(60,20,10),0:(0,0,0),1:(110,150,210),2:(200,220,240),3:(240,200,80),4:(120,60,40),5:(220,60,60),6:(60,180,60),7:(160,60,200)}
img=np.array([pal[c] for c in codes],np.uint8).reshape(H,W,3)[::-1]
Image.fromarray(img).resize((W*3,H*3),Image.NEAREST).save(out+'.png')
