import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The Android resources and the repository preview share this geometry.
// The player stays inside the central adaptive-icon safe circle.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = resolve(root, 'android-player/app/src/main/res');
const gradients = new Map();
const shapes = [];
const round = (x, y, w, h, r) => `M${x+r},${y} H${x+w-r} A${r},${r} 0,0 1,${x+w},${y+r} V${y+h-r} A${r},${r} 0,0 1,${x+w-r},${y+h} H${x+r} A${r},${r} 0,0 1,${x},${y+h-r} V${y+r} A${r},${r} 0,0 1,${x+r},${y} Z`;
const circle = (x, y, r) => `M${x-r},${y} A${r},${r} 0,1 1,${x+r},${y} A${r},${r} 0,1 1,${x-r},${y} Z`;
const gradient = (id, from, to, colors) => {
  gradients.set(id, { from, to, colors });
  return id;
};
const add = (d, fill, opacity = 1) => shapes.push({ d, fill, opacity });

gradient('rim', [36, 27], [73, 81], ['#B8C0CB', '#FFFFFF', '#C9CED7']);
gradient('body', [38, 29], [73, 81], ['#FFFFFF', '#F4F6F9', '#DFE4EB']);
gradient('bezel', [39, 30], [70, 50], ['#7E8D9C', '#E4EAF0', '#9DA9B5']);
gradient('glass', [39, 31], [69, 50], ['#FBFEFF', '#EAF4FA', '#D4E4EE']);
gradient('wave', [54, 35], [54, 44], ['#B4D2E1', '#8DB7CD']);
gradient('wheelRim', [45, 54], [63, 78], ['#A9B2BE', '#FBFCFD', '#B7C0CD']);
gradient('wheel', [46, 55], [63, 77], ['#FFFFFF', '#F7F9FC', '#E9EDF3']);
gradient('buttonRim', [50, 62], [58, 71], ['#A0ABB8', '#F6F8FB', '#AEB9C6']);
gradient('button', [50, 61], [59, 72], ['#F5F7FA', '#D4DBE4', '#EFF2F6']);

add(round(33.2, 27.4, 41.6, 55.6, 7.8), '#708098', 0.035);
add(round(33.7, 27.2, 40.6, 55.1, 7.4), '#708098', 0.055);
add(round(34, 27, 40, 55, 7), '#758197', 0.10);
add(round(34, 26.5, 40, 55, 7), 'rim');
add(round(34.35, 26.85, 39.3, 54.3, 6.65), 'body');
add('M41,26.85 H67 A6.65,6.65 0,0 1,73.65,33.5 V34 A7.1,7.1 0,0 0,66.8,27.3 H41.2 A6.8,6.8 0,0 0,34.7,33.8 V33.5 A6.65,6.65 0,0 1,41,26.85 Z', '#FFFFFF', 0.9);

add(round(37, 30, 34, 20.5, 4), 'bezel');
add(round(37.42, 30.42, 33.16, 19.66, 3.58), '#E9EFF4');
add(round(37.7, 30.7, 32.6, 19.1, 3.3), '#91A5B4');
add(round(37.87, 30.87, 32.26, 18.76, 3.13), 'glass');
add('M41,31.12 H67 A2.9,2.9 0,0 1,69.88,34 V34.25 A3.1,3.1 0,0 0,66.8,31.48 H41.2 A3.1,3.1 0,0 0,38.12,34.25 V34 A2.9,2.9 0,0 1,41,31.12 Z', '#FFFFFF', 0.85);
for (const [x, y, h] of [[45.1,39.4,4.1], [49.1,37.2,6.3], [53.1,35,8.9], [57.1,37.2,6.3], [61.1,39.4,4.1]]) {
  add(round(x, y, 1.8, h, 0.9), 'wave');
}

add(circle(54, 66.25, 13.25), '#8794A8', 0.17);
add(circle(54, 65.9, 13.1), 'wheelRim');
add(circle(54, 65.9, 12.76), 'wheel');
add(circle(54, 65.9, 6.05), 'buttonRim');
add(circle(54, 65.9, 5.79), 'button');

function androidPath({ d, fill, opacity }) {
  const alpha = opacity === 1 ? '' : ` android:fillAlpha="${opacity}"`;
  if (!gradients.has(fill)) return `    <path android:pathData="${d}" android:fillColor="${fill}"${alpha} />`;
  const g = gradients.get(fill);
  return `    <path android:pathData="${d}"${alpha}>\n      <aapt:attr name="android:fillColor">\n        <gradient android:type="linear" android:startX="${g.from[0]}" android:startY="${g.from[1]}" android:endX="${g.to[0]}" android:endY="${g.to[1]}">\n${g.colors.map((color, i) => `          <item android:offset="${i/(g.colors.length-1)}" android:color="${color}" />`).join('\n')}\n        </gradient>\n      </aapt:attr>\n    </path>`;
}

const header = '<?xml version="1.0" encoding="utf-8"?>\n';
const vector = (content) => `${header}<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${content}\n</vector>\n`;
const foreground = shapes.map(androidPath).join('\n');
const adaptive = (monochrome = false) => `${header}<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n${monochrome ? '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n' : ''}</adaptive-icon>\n`;
const monoBody = round(34, 26.5, 40, 55, 7);
const monoScreen = round(37.7, 30.7, 32.6, 19.1, 3.3);
const monoWheel = circle(54, 65.9, 11.6);
const monoButton = circle(54, 65.9, 5.4);
const monochrome = vector(`    <path android:fillColor="#000000" android:fillType="evenOdd" android:pathData="${monoBody} ${monoScreen} ${monoWheel} ${monoButton}" />\n${shapes.filter(s => s.fill === 'wave').map(s => `    <path android:fillColor="#000000" android:pathData="${s.d}" />`).join('\n')}`);

const definitions = [...gradients].map(([id, g]) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}">${g.colors.map((color, i) => `<stop offset="${i/(g.colors.length-1)}" stop-color="${color}"/>`).join('')}</linearGradient>`).join('\n');
const svgPaths = shapes.map(s => `<path d="${s.d}" fill="${gradients.has(s.fill) ? `url(#${s.fill})` : s.fill}"${s.opacity === 1 ? '' : ` opacity="${s.opacity}"`}/>`).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 108 108" role="img" aria-label="Pocket Classic silver-white icon">\n<defs>${definitions}</defs>\n<path fill="#F8FAFD" d="M0,0 H108 V108 H0 Z"/>\n<g transform="translate(-27,-27) scale(1.5)">\n${svgPaths}\n</g>\n</svg>\n`;

const files = new Map([
  ['drawable/ic_launcher_foreground.xml', vector(foreground)],
  ['drawable/ic_launcher.xml', vector(`    <path android:pathData="M0,0 H108 V108 H0 Z" android:fillColor="#F8FAFD" />\n    <group android:pivotX="54" android:pivotY="54" android:scaleX="1.5" android:scaleY="1.5">\n${foreground}\n    </group>`)],
  ['drawable/ic_launcher_monochrome.xml', monochrome],
  ['values/icon_colors.xml', `${header}<resources>\n    <color name="ic_launcher_background">#F8FAFD</color>\n</resources>\n`],
  ['mipmap-anydpi-v26/ic_launcher.xml', adaptive()],
  ['mipmap-anydpi-v33/ic_launcher.xml', adaptive(true)],
]);
for (const [name, text] of files) {
  const target = resolve(res, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
}
const preview = resolve(root, 'docs/branding/pocket-classic-icon.svg');
await mkdir(dirname(preview), { recursive: true });
await writeFile(preview, svg, 'utf8');
console.log(`Generated ${files.size} Android resources and docs/branding/pocket-classic-icon.svg`);
