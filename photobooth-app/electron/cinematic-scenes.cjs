const fs = require('fs');
const path = require('path');
const SCENES = ['graveyard', 'evil-dead-cabin'];
function seedCinematicScenes(bundled, config) {
  const marker = path.join(config, '.cinematic-scenes-v1');
  if (fs.existsSync(marker)) return;
  const source = path.join(bundled, 'ai-backgrounds/scene');
  const target = path.join(config, 'ai-backgrounds/scene');
  const files = scene => [scene + '.webp', scene + '.depths.json', ...['close', 'medium', 'wide'].map(d => `depths/${scene}/${d}.webp`)];
  if (!SCENES.every(s => files(s).every(f => fs.existsSync(path.join(source, f))))) return;
  const removed = new Set();
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) scan(path.join(dir, e.name)); else removed.add(e.name);
    }
  }
  scan(path.join(config, 'ai-backgrounds/.removed'));
  scan(path.join(target, '.removed'));
  for (const scene of SCENES) {
    if (removed.has(scene + '.webp') || fs.existsSync(path.join(target, scene + '.webp'))) continue;
    // Copy the main plate last so a partially copied set is never offered.
    for (const file of files(scene).reverse()) {
      const dest = path.join(target, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(source, file), dest);
    }
  }
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(marker, new Date().toISOString());
}
module.exports = { seedCinematicScenes, SCENES };
