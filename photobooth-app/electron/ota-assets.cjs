const fs = require('fs');
const path = require('path');

// OTA keeps operator config. Seed newly shipped assets once, without replacing
// custom images or restoring sets an operator has already removed.
function seedMissingAssets(bundled, config) {
  applyReleaseProfile(bundled, config);
  require('./stock-frame-refresh.cjs').refreshStockFrames(path.join(bundled, 'photo-frames'), path.join(config, 'photo-frames'));
  const marker = path.join(config, '.assets-1.1.47');
  if (fs.existsSync(marker) || !fs.existsSync(bundled)) return;
  for (const name of ['ai-backgrounds', 'photo-frames', 'compositions']) {
    const source = path.join(bundled, name);
    const target = path.join(config, name);
    if (!fs.existsSync(source)) continue;
    if (name === 'ai-backgrounds' && fs.existsSync(path.join(target, '.removed'))) continue;
    fs.cpSync(source, target, {
      recursive: true, force: false, errorOnExist: false,
      filter: (src, dest) => !fs.statSync(src).isDirectory() ||
        !fs.existsSync(path.join(dest, '.removed')),
    });
  }
  fs.writeFileSync(marker, new Date().toISOString());
}

function applyReleaseProfile(bundled, config) {
  const profilePath = path.join(bundled, 'release-profile.json');
  if (!fs.existsSync(profilePath)) return;
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  if (!['1.1.48', '1.1.53'].includes(profile.version)) throw Error('Unsupported release profile');
  const marker = path.join(config, '.release-' + profile.version);
  if (fs.existsSync(marker)) return;
  const backup = path.join(config, '.ota-backups', profile.version);
  const preserve = (file) => {
    const dest = path.join(backup, path.relative(config, file));
    if (fs.existsSync(file) && !fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest);
    }
  };
  const copy = (src, dest) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const from = path.join(src, entry.name), to = path.join(dest, entry.name);
      if (entry.isDirectory()) copy(from, to);
      else { preserve(to); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    }
  };
  // Only shipped artwork is refreshed; other operator images stay in place.
  for (const name of ['ai-backgrounds', 'photo-frames', 'compositions']) {
    const source = path.join(bundled, name);
    if (fs.existsSync(source)) copy(source, path.join(config, name));
  }
  const settingsPath = path.join(config, 'photobooth-config.json');
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  preserve(settingsPath);
  // Never transfer credentials, booth identity, printer, camera or network settings.
  for (const key of ['activeThemeId', 'aiModes', 'defaultAiModeId', 'aiGenerationEnabled', 'guestModes', 'photoFrames', 'copy']) {
    if (profile.settings[key] !== undefined) settings[key] = profile.settings[key];
  }
  if (typeof profile.settings.guestFlow?.skipAiPreviewToThanks === 'boolean') {
    settings.guestFlow = { ...settings.guestFlow, skipAiPreviewToThanks: profile.settings.guestFlow.skipAiPreviewToThanks };
  }
  const temp = settingsPath + '.ota-tmp';
  fs.writeFileSync(temp, JSON.stringify(settings, null, 2));
  fs.renameSync(temp, settingsPath);
  fs.writeFileSync(marker, new Date().toISOString());
}

module.exports = { seedMissingAssets, applyReleaseProfile };
