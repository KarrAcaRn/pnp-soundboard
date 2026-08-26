const settings = require("./js/customizations.json");
const path = require("path");
const walk = require("fs-walk");
const fs = require("fs");

const soundDir = path.resolve(`./${settings.soundDirName}`);

if (!fs.existsSync(soundDir)) {
  fs.mkdirSync(soundDir, { recursive: true });
  console.log(
    `Created empty "${settings.soundDirName}/". Add files as ${settings.soundDirName}/<category>/<title>.mp3`
  );
}

const sounds = {};
walk.walkSync(soundDir, (dirPath, file, stats) => {
  if (stats.isDirectory()) {
    return;
  }
  const dir = path.basename(dirPath);
  if (dir === settings.soundDirName) {
    return;
  }
  if (sounds[dir]) {
    sounds[dir].push(file);
  } else {
    sounds[dir] = [file];
  }
});

Object.keys(sounds).forEach(cat => {
  sounds[cat].sort((a, b) => a.localeCompare(b));
});

console.log(sounds);

fs.writeFileSync(`./${settings.soundDirName}.json`, JSON.stringify(sounds));
