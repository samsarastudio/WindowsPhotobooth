// Preserve decorative edges after the booth downloads a photo under a temporary name.
export function tabletPrintLayout(variant, requested) {
  if (variant === 'physical' || requested === 'physicalFrame') return 'physicalFrame';
  if (variant === 'framed' || variant === 'ai') return 'framedPhoto';
  return null;
}
