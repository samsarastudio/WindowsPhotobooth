/** An unfinished AI capture must not become printable merely because a classic frame exists. */
export function tabletProcessStatus(siblings) {
  if (siblings.some(photo => photo.variant === 'ai')) return 'ready';
  if (siblings.some(photo => photo.process_status === 'processing')) return 'processing';
  if (siblings.some(photo => photo.process_status === 'failed')) return 'failed';
  return 'ready';
}
