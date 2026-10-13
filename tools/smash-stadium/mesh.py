import xml.etree.ElementTree as ET
NS='{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
def load(path):
    r=ET.parse(path).getroot()
    V=[(float(v.get('x')),float(v.get('y')),float(v.get('z'))) for v in r.iter(NS+'vertex')]
    T=[(int(t.get('v1')),int(t.get('v2')),int(t.get('v3'))) for t in r.iter(NS+'triangle')]
    return V,T
