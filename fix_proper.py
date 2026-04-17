#!/usr/bin/env python3
with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx') as f:
    lines = f.readlines()

new_section = [
    "    '</style></head><body>' +\n",
    "    '<div id=\"dbg\" style=\"position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;padding:2px 6px;font-size:10px;z-index:99999;font-family:monospace;\">loading</div>' +\n",
    "    '<div id=\"map\"></div><script src=\"file:///android_asset/leaflet.js\" onload=\"dbg()\"></script><script>' +\n",
    "    'function dbg(){var s=document.getElementById(\"dbg\");try{var map=L.map(\"map\",{zoomControl:false,attributionControl:false});s.innerHTML=\"map ok\";var tileLayer=L.tileLayer(' + TILE_URL + ',{maxZoom:19,opacity:0.85});tileLayer.on(\"load\",function(){s.innerHTML=\"tiles ok\";});tileLayer.on(\"tileerror\",function(e){s.innerHTML=\"tile err\";});tileLayer.addTo(map);s.innerHTML=\"added\";}catch(e){s.innerHTML=\"err:\"+e.message;}};' +\n",
    "    'window.onerror=function(m){document.getElementById(\"dbg\").innerHTML=\"js err:\"+m;};' +\n",
    "    'var polyline=null;var currentMarker=null;var coords=[];' +\n",
]

# Replace lines 680-686 (0-indexed 679-685)
result = lines[:679] + new_section + lines[686:]

with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
    f.writelines(result)

print('Done')
with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx') as f:
    c = f.read()
print('dbg:', 'id="dbg"' in c, 'onload:', 'onload="dbg()"' in c)
