// Shared by the LCD painter and the generated web stylesheet.
export const lcdPalette=Object.freeze({
  surface:'#fbfcfe',ink:'#1b2b3a',muted:'#4b6278',
  selectionTop:'#216db3',selectionBottom:'#174f89',onSelection:'#ffffff',
  onSelectionMuted:'#edf5ff',accent:'#246ab4',line:'#c5d2df',
});
export const motionTiming=Object.freeze({menu:160,cover:220,finish:300,reader:260});
export const styleVariables=`:root{--pc-ink:${lcdPalette.ink};--pc-muted:${lcdPalette.muted};--pc-surface:${lcdPalette.surface};--pc-accent:${lcdPalette.accent};--pc-selected:${lcdPalette.selectionTop};--pc-selected-end:${lcdPalette.selectionBottom};--pc-focus:#246ab4;--pc-touch:48px;--pc-space:8px;--pc-radius:14px;--pc-menu-duration:${motionTiming.menu}ms;--pc-reader-duration:${motionTiming.reader}ms}`;
