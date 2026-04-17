#!/usr/bin/env python3
with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx') as f:
    lines = f.readlines()

new_section = [
    "    '</style></head><body>' +\n",
    "    '<div id=\"dbg\" style=\"position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;padding:2px 6px;font-size:10px;z-index:99999;font-family:monospace;\">start</div>' +\n",
    "    '<div id=\"map\"></div><script src=\"file:///android_asset/leaflet.js\"></script><script>window.dbg=function(s){document.getElementById(\"dbg\").innerHTML=s;};window.onerror=function(m){document.getElementById(\"dbg\").innerHTML=\"ERR:\"+m;};window.dbg(\"L\");' +\n",
    "    'try{var map=L.map(\"map\",{zoomControl:false,attributionControl:false});window.dbg(\"2\");' +\n",
    "    'var tileLayer=L.tileLayer(' + TILE_URL + ',{maxZoom:19,opacity:0.85});window.dbg(\"3\");' +\n",
    "    'tileLayer.addTo(map);window.dbg(\"4\");tileLayer.on(\"load\",function(){window.dbg(\"OK\");});tileLayer.on(\"tileerror\",function(e){window.dbg(\"TE:\"+JSON.stringify(e));});}catch(e){window.dbg(\"E:\"+e.message);};' +\n",
    "    'var polyline=null;var currentMarker=null;var coords=[];' +\n",
]

# Replace lines 680-684 (0-indexed: 679-683) with new_section
# new_section[6] replaces L685 'var polyline'
result = lines[:679] + new_section + lines[685:]

with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
    f.writelines(result)

print('Done')
# Verify
with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx') as f:
    c = f.read()
print('dbg:', 'id="dbg"' in c)
print('window.dbg:', 'window.dbg' in c)
print('tileLayer.on:', 'tileLayer.on' in c)
