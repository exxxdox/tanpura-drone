// 顺时针每次上行七个半音；保留原始索引，切换布局不会改变录音与主音。
export const CIRCLE_KEYS = Array.from({ length: 12 }, (_, step) => ({
  index: step * 7 % 12,
  left: 50 + 40 * Math.sin(step * Math.PI / 6),
  top: 50 - 40 * Math.cos(step * Math.PI / 6),
}));

const point = (radius, angle) => {
  const radians = angle * Math.PI / 180;
  return [130 + radius * Math.sin(radians), 130 - radius * Math.cos(radians)];
};
// 升号侧的关系小调按五度圈习惯写 F#m / C#m / G#m，避免内圈出现降号等音。
const minorNames = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];

// 同一扇区连起主调与关系小调；只改变选调外观，仍使用十二份主调录音。
export const CIRCLE_SECTORS = CIRCLE_KEYS.map((key, step) => {
  const angle = step * 30;
  const start = point(128, angle - 15);
  const end = point(128, angle + 15);
  const innerEnd = point(46, angle + 15);
  const innerStart = point(46, angle - 15);
  return {
    index: key.index,
    path: `M${start} A128,128 0 0 1 ${end} L${innerEnd} A46,46 0 0 0 ${innerStart} Z`,
    major: point(108, angle),
    minor: point(67, angle),
    minorName: minorNames[step],
  };
});
