// Layout preserves every image's aspect ratio and the photographer's source order.
export function layoutPhotos(
  ratios,
  width,
  {
    layout = "vertical",
    large = false,
    gap = 8,
    mobile = false,
    tablet = false,
  } = {},
) {
  ratios = ratios.map((r) => (Number.isFinite(r) && r > 0 ? r : 1.5));
  const boxes = [];
  if (!ratios.length || width <= 0) return { boxes, height: 0 };
  if (layout === "vertical") {
    const columns = mobile
      ? large
        ? 1
        : 2
      : tablet
        ? large
          ? 2
          : 3
        : large
          ? 3
          : 4;
    const heights = Array(columns).fill(0);
    const w = (width - gap * (columns - 1)) / columns;
    for (const ratio of ratios) {
      const column = heights.indexOf(Math.min(...heights));
      const h = w / ratio;
      boxes.push({
        x: column * (w + gap),
        y: heights[column],
        width: w,
        height: h,
      });
      heights[column] += h + gap;
    }
    return { boxes, height: Math.max(...heights) - gap };
  }
  const target = width / (mobile ? (large ? 1.5 : 2.2) : large ? 4 : 6);
  let y = 0,
    start = 0;
  while (start < ratios.length) {
    let end = start,
      sum = 0;
    while (end < ratios.length) {
      const nextSum = sum + ratios[end];
      const nextHeight = (width - gap * (end - start)) / nextSum;
      if (end > start && nextHeight < target) {
        const previousHeight = (width - gap * (end - start - 1)) / sum;
        if (Math.abs(previousHeight - target) < Math.abs(nextHeight - target))
          break;
      }
      sum = nextSum;
      end++;
      if (nextHeight <= target) break;
    }
    const fitted = (width - gap * (end - start - 1)) / sum;
    // Keep a short final row at natural size instead of magnifying its last portrait.
    const h = end === ratios.length ? Math.min(target, fitted) : fitted;
    let x = 0;
    for (let i = start; i < end; i++) {
      const w = ratios[i] * h;
      boxes.push({ x, y, width: w, height: h });
      x += w + gap;
    }
    y += h + gap;
    start = end;
  }
  return { boxes, height: y - gap };
}
