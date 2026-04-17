#!/usr/bin/env python3
content = open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx').read()
lines = content.split('\n')

# Add debug div after <body>
new_lines = []
for line in lines:
    new_lines.append(line)
    if "'</style></head><body>' +" in line:
        new_lines.append("    '<div id=\"dbg\" style=\"position:absolute;top:0;left:0;right:0;background:#000;color:#0f0;padding:2px 6px;font-size:10px;z-index:9999;font-family:monospace;\">---</div>' +")

# Add onMessage to WebView
final_lines = []
for line in new_lines:
    final_lines.append(line)
    if "onError={() => console.log('WebView error')}" in line:
        final_lines.append("        onMessage={(e) => console.log('[W]', e.nativeEvent.data)}")

with open('/home/admin/.openclaw/workspace/RunFitPure/components/OSMap.tsx', 'w') as f:
    f.write('\n'.join(final_lines))
print('Done')
