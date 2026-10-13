# 用 source_offset 把零件拼回原位,存成一個 json(點、三角形、零件名)
import sys, json, xml.etree.ElementTree as ET
sys.path.insert(0, sys.argv[1]); from mesh import load
X=sys.argv[2]; out=sys.argv[3]
NS='{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
PNS='{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'
files={}
for obj in ET.parse(f'{X}/3D/3dmodel.model').getroot().iter(NS+'object'):
    for c in obj.iter(NS+'component'): files[obj.get('id')]=c.get(PNS+'path')
parts=[]
for o in ET.parse(f'{X}/Metadata/model_settings.config').getroot().findall('object'):
    for p in o.findall('part'):
        m={x.get('key'):x.get('value') for x in p.findall('metadata')}
        off=[float(m['source_offset_'+k]) for k in 'xyz']
        parts.append((o.get('id'), m['name'], off))
res=[]
for oid,name,off in parts:
    V,T=load(X+files[oid])
    res.append({'name':name,'off':off,'V':[(x+off[0],y+off[1],z+off[2]) for x,y,z in V],'T':T})
    xs=[v[0] for v in res[-1]['V']]; ys=[v[1] for v in res[-1]['V']]; zs=[v[2] for v in res[-1]['V']]
    print(f'{name:16s} off {off[0]:7.1f} {off[1]:6.1f} {off[2]:7.1f}  x {min(xs):7.1f}..{max(xs):7.1f}  y {min(ys):6.1f}..{max(ys):6.1f}  z {min(zs):7.1f}..{max(zs):7.1f}')
json.dump(res,open(out,'w'))
