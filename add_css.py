with open('components/OSMap.tsx', 'r') as f:
    content = f.read()

old = "'<meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\\\"> +\n    '<style>' + LEAFLET_CSS +"
new = "'<meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\\\"> +\n    '<link rel=\\\"stylesheet\\\" href=\\\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\\\"/>' +\n    '<style>' + LEAFLET_CSS +"

if old in content:
    content = content.replace(old, new)
    with open('components/OSMap.tsx', 'w') as f:
        f.write(content)
    print('SUCCESS: Added Leaflet CSS CDN link')
else:
    print('NOT FOUND')
    for i, line in enumerate(content.split('\n')):
        if 'viewport' in line:
            print(f'Line {i+1}: {repr(line)}')
