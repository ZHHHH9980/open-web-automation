/**
 * 浏览器配置管理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'browser.json');

/**
 * 加载浏览器配置
 */
function loadBrowserConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error('[browser-config] 加载配置失败:', err.message);
    return null;
  }
}

/**
 * 保存浏览器配置
 */
function saveBrowserConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('[browser-config] 保存配置失败:', err.message);
    return false;
  }
}

/**
 * 检测 Chrome profiles
 */
function detectChromeProfiles() {
  const chromeDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

  if (!fs.existsSync(chromeDir)) {
    return [];
  }

  const profiles = [];
  const entries = fs.readdirSync(chromeDir);

  for (const entry of entries) {
    if (entry === 'Default' || entry.startsWith('Profile ')) {
      const profilePath = path.join(chromeDir, entry);
      const stat = fs.statSync(profilePath);

      if (stat.isDirectory()) {
        profiles.push({
          name: entry,
          path: profilePath
        });
      }
    }
  }

  return profiles;
}

/**
 * 获取默认 Chrome 路径
 */
function getDefaultChromePath() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * 解析运行时浏览器配置
 */
function getRuntimeBrowserConfig(cdpUrl) {
  const saved = loadBrowserConfig() || {};
  return {
    cdpUrl: process.env.WEB_CDP_URL || cdpUrl || saved.cdpUrl || 'http://127.0.0.1:9222',
    profilePath: process.env.WEB_CHROME_PROFILE || saved.profilePath || '',
    chromePath: process.env.WEB_CHROME_PATH || saved.chromePath || getDefaultChromePath() || ''
  };
}

/**
 * 初始化配置（首次使用）
 */
async function initBrowserConfig() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }

  console.log('=== 浏览器配置向导 ===\n');

  // 1. 检测 Chrome profiles
  const profiles = detectChromeProfiles();

  if (profiles.length === 0) {
    console.error('未找到 Chrome profiles');
    rl.close();
    return null;
  }

  console.log('检测到以下 Chrome profiles:\n');
  profiles.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name}`);
  });

  const choice = await question(`\n请选择 profile (1-${profiles.length}): `);
  const profileIndex = parseInt(choice) - 1;

  if (profileIndex < 0 || profileIndex >= profiles.length) {
    console.error('无效的选择');
    rl.close();
    return null;
  }

  const selectedProfile = profiles[profileIndex];

  // 2. 检测 Chrome 路径
  const chromePath = getDefaultChromePath();

  if (!chromePath) {
    console.error('未找到 Chrome');
    rl.close();
    return null;
  }

  // 3. CDP 端口
  const cdpPort = await question('\nCDP 端口 (默认 9222): ') || '9222';

  const config = {
    cdpUrl: `http://127.0.0.1:${cdpPort}`,
    profilePath: selectedProfile.path,
    chromePath: chromePath
  };

  // 4. 保存配置
  if (saveBrowserConfig(config)) {
    console.log('\n✓ 配置已保存到:', CONFIG_FILE);
    console.log('\n配置内容:');
    console.log(JSON.stringify(config, null, 2));
  }

  rl.close();
  return config;
}

/**
 * 获取浏览器配置（自动初始化）
 */
async function getBrowserConfig() {
  let config = loadBrowserConfig();

  if (!config) {
    console.log('[browser-config] 首次使用，需要配置浏览器\n');
    config = await initBrowserConfig();
  }

  return config;
}

module.exports = {
  loadBrowserConfig,
  saveBrowserConfig,
  detectChromeProfiles,
  getDefaultChromePath,
  getRuntimeBrowserConfig,
  initBrowserConfig,
  getBrowserConfig
};
