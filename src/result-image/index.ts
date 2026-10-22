
/** Freeze a result-only copy so edits during rasterization cannot mix snapshots. */
export async function downloadResultImage(source: HTMLElement, planName: string): Promise<void> {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('export-results');
  clone.classList.remove('is-stale');
  clone.removeAttribute('aria-busy');
  clone.querySelectorAll('[data-export-exclude], .result-controls, .result-top .save-indicator, .chart-heading label, .monthly-explanation').forEach(node => node.remove());
  clone.querySelectorAll('details').forEach(node => { node.open = true; });
  const heading = document.createElement('h1');
  heading.textContent = planName;
  heading.className = 'export-plan-name';
  clone.prepend(heading);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;width:960px;pointer-events:none;';
  host.append(clone);
  document.body.append(host);
  try {
    await document.fonts.ready;
    // The rasterizer deep-clones SVG without decorating its descendants.
    // Inline the resolved SVG styles while this copy is still in the document.
    for (const node of clone.querySelectorAll<SVGElement>('svg, svg *')) {
      const styles = getComputedStyle(node);
      for (const property of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight', 'opacity', 'text-anchor']) {
        node.style.setProperty(property, styles.getPropertyValue(property));
      }
    }
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(clone, { backgroundColor: '#141615', pixelRatio: 2, skipFonts: true });
    if (!blob) throw new Error('图片生成失败');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FIRE-${planName.replace(/[\\/:*?"<>|]/g, '_')}-结果.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { host.remove(); }
}
