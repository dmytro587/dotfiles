#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const source = path.join(__dirname, '..', 'source-control.json');
const liveProfile = path.join(os.homedir(), 'Library', 'Application Support', 'orca', 'profiles', 'local-default');
const profile = process.env.ORCA_PROFILE_DIR || liveProfile;
const target = path.join(profile, 'orca-data.json');

function orcaIsRunning() {
  const result = spawnSync('pgrep', ['-x', 'Orca'], { stdio: 'ignore' });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error('Could not check whether Orca is running');
  }
  return result.status === 0;
}

function install() {
  if (process.platform !== 'darwin') {
    throw new Error('This importer supports the macOS Orca profile only');
  }
  if (!fs.existsSync(target)) {
    throw new Error(`No Orca profile at ${target}. Launch Orca once, quit it, then rerun this installer.`);
  }

  const desired = JSON.parse(fs.readFileSync(source, 'utf8')).settings;
  const current = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (current.schemaVersion !== 1 || !current.settings || typeof current.settings !== 'object') {
    throw new Error('Unknown Orca profile format. Refusing to change it.');
  }

  const settings = {
    ...current.settings,
    ...desired,
    sourceControlAi: {
      ...current.settings.sourceControlAi,
      ...desired.sourceControlAi,
      actions: {
        ...current.settings.sourceControlAi?.actions,
        ...desired.sourceControlAi.actions,
      },
      prCreationDefaults: {
        ...current.settings.sourceControlAi?.prCreationDefaults,
        ...desired.sourceControlAi.prCreationDefaults,
      },
    },
    commitMessageAi: {
      ...current.settings.commitMessageAi,
      ...desired.commitMessageAi,
    },
  };

  if (JSON.stringify(settings) === JSON.stringify(current.settings)) {
    console.log('Orca source-control settings already match');
    return;
  }

  if (fs.existsSync(liveProfile) && fs.realpathSync(profile) === fs.realpathSync(liveProfile) && orcaIsRunning()) {
    throw new Error('Quit Orca before restoring source-control settings, then rerun this installer.');
  }

  const backup = `${target}.dotfiles-backup-${Date.now()}-${randomUUID()}`;
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, 0o600);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ ...current, settings })}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Restored Orca source-control settings. Backup: ${backup}`);
}

try {
  install();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
