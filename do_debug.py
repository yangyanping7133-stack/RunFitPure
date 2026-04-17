#!/usr/bin/env python3
content = open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx').read()
lines = content.split('\n')

# Find and replace the map init lines
# L684: 'var map=L.map("map",{zoomControl:false,attributionControl:false});' +
# L685: 'var tileLayer=L.tileLayer(' + TILE_URL + ',{maxZoom:19,opacity:0.85});' +
# L686: 'tileLayer.addTo(map);' +

new_lines = []
for i, line in enumerate(lines):
    if i == 683:  # L684 - map init
        new_lines.append("    'try{var map=L.map(\"map\",{zoomControl:false,attributionControl:false});console.log(\"MAP:map_created\");' +")
    elif i == 684:  # L685 - tileLayer
        new_lines.append("    'var tileLayer=L.tileLayer(' + TILE_URL + ',{maxZoom:19,opacity:0.85});console.log(\"MAP:tileLayer_created\");' +")
    elif i == 685:  # L686 - addTo
        new_lines.append("    'tileLayer.addTo(map);console.log(\"MAP:tiles_added\");tileLayer.on(\"load\",function(){console.log(\"MAP:tiles_loaded\");});tileLayer.on(\"tileerror\",function(e){console.log(\"MAP:tile_error:\"+JSON.stringify(e));});}catch(e){console.log(\"MAP:error:\"+e.message);};' +")
    else:
        new_lines.append(line)

with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
    f.write('\n'.join(new_lines))

c = open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx').read()
print('MAP:log present:', 'MAP:' in c)
print('DONE')
