with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)
    # After the script src line, add debug overlay and error handling
    if "'<div id=\"map\"></div><script src=\"https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.js\"></script><script>' +" in line:
        # Replace this line with one that adds a debug div and starts try block
        idx = len(new_lines) - 1
        new_lines[idx] = """    '<div id="map"></div><div id="debug" style="position:fixed;top:0;left:0;background:#000;color:#0f0;padding:8px;font-size:12px;z-index:9999;width:100%;font-family:monospace;">Loading Leaflet...</div><script src="https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.js"></script><script>
window.onerror=function(m){document.getElementById("debug").innerHTML+="<br>ERR:"+m;};
window.addEventListener("message",function(e){try{var d=JSON.parse(e.data);document.getElementById("debug").innerHTML="MSG:"+d.type;}catch(err){}});
window.addEventListener("load",function(){document.getElementById("debug").innerHTML+="<br>win.load";});
try{""" + '\n'
    # Wrap the map initialization in try-catch
    if "'var map=L.map" in line and "zoomControl" in line:
        idx = len(new_lines) - 1
        new_lines[idx] = "    'try{var map=L.map(\"map\",{zoomControl:false,attributionControl:false});document.getElementById(\"debug\").innerHTML+=\"<br>map created\";var tileLayer=L.tileLayer(' + TILE_URL + ',{maxZoom:19,opacity:0.85});tileLayer.on(\"load\",function(){document.getElementById(\"debug\").innerHTML+=\"<br>tiles loaded\";});tileLayer.on(\"tileerror\",function(e){document.getElementById(\"debug\").innerHTML+=\"<br>tile ERR:\"+JSON.stringify(e);});tileLayer.addTo(map);document.getElementById(\"debug\").innerHTML+=\"<br>tileLayer added\";}' +\n"

with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
    f.writelines(new_lines)

print('Done')
# Verify
content = open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx').read()
print('debug div present:', 'id="debug"' in content)
print('try block present:', 'try{var map' in content)
