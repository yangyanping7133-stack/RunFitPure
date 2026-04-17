with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'r') as f:
    content = f.read()

old = "'<div id=\\\"map\\\"></div><script src=\\\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\\\"></script><script>'"

new = """'<div id=\\"map\\"></div><script src=\\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\\"></script><script>\\
console.log("[LEAFLET] script tag running");\\
window.onerror=function(m,s,l,c){window.ReactNativeWebView&&ReactNativeWebView.postMessage(JSON.stringify({type:"jserror",msg:m}));};\\
try{"""

if old in content:
    content = content.replace(old, new)
    with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
        f.write(content)
    print('SUCCESS')
else:
    print('NOT FOUND')
    for i, line in enumerate(content.split('\n')):
        if 'leaflet.js' in line and 'script' in line:
            print(f'Line {i+1}: {repr(line)}')
