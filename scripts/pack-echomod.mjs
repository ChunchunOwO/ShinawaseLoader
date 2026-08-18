import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  bCyan: '\x1b[96m',
  green: '\x1b[32m',
  bGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  bYellow: '\x1b[93m',
  red: '\x1b[31m',
  bRed: '\x1b[91m',
  magenta: '\x1b[35m',
  bMagenta: '\x1b[95m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
};

const formatBytes = (bytes) => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const printBanner = () => {
  console.log(`\n${c.bCyan}╭─────────────────────────────────────────────────────────────╮${c.reset}`);
  console.log(`${c.bCyan}│${c.reset}  ${c.bold}${c.white}✦ ShinawaseLoader${c.reset} ${c.dim}·${c.reset} ${c.bCyan}ECHO 模组打包工具 (.echomod)${c.reset}            ${c.bCyan}│${c.reset}`);
  console.log(`${c.bCyan}╰─────────────────────────────────────────────────────────────╯${c.reset}\n`);
};

try {
  printBanner();
  const inputArg = process.argv[2];
  if (!inputArg || !statSync(resolve(inputArg), { throwIfNoEntry: false })?.isDirectory()) {
    console.log(`  ${c.bRed}✖ 未指定有效的模组源代码目录${c.reset}`);
    console.log(`\n  ${c.bold}用法:${c.reset} ${c.cyan}pack-mod.bat <模组目录> [输出文件.echomod]${c.reset}`);
    console.log(`  ${c.gray}示例: pack-mod.bat .\\mods\\ECHO-Together\\echomod .\\Packages\\ECHO-Together.echomod${c.reset}\n`);
    process.exit(2);
  }
  const root = resolve(inputArg);

  const manifestPath = [join(root, 'echo.mod.json'), join(root, 'echo.plugin.json')].find((candidate) =>
    statSync(candidate, { throwIfNoEntry: false })?.isFile()
  );
  if (!manifestPath) {
    console.log(`  ${c.bRed}✖ 目录中未找到 echo.mod.json 或 echo.plugin.json 清单文件:${c.reset}`);
    console.log(`    ${c.yellow}${root}${c.reset}\n`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const allowed = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.md', '.txt', '.sig', '.svg']);
  
  console.log(`  ${c.bold}${c.white}📂 正在扫描目录文件...${c.reset} ${c.gray}(${root})${c.reset}`);
  const dirEntries = readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const item of dirEntries) {
    if (item.isFile() && item.name !== 'plugin-storage.json' && item.name !== 'plugin-state.json' && allowed.has(extname(item.name).toLowerCase())) {
      const fullPath = join(root, item.name);
      const st = statSync(fullPath);
      const content = readFileSync(fullPath, 'utf8');
      files.push({ path: item.name, content, size: st.size });
      console.log(`    ${c.bGreen}✔${c.reset} ${c.white}${item.name.padEnd(24)}${c.reset} ${c.dim}(${formatBytes(st.size)})${c.reset}`);
    }
  }

  const output = resolve(process.argv[3] || `${manifest.id || 'mod'}-${manifest.version || '1.0.0'}.echomod`);
  const packagePayload = {
    type: manifestPath.endsWith('echo.mod.json') ? 'echo-external-mod' : 'echo-plugin-package',
    version: 1,
    exportedAt: new Date().toISOString(),
    manifest,
    files: files.map(({ path, content }) => ({ path, content })),
  };

  const jsonStr = `${JSON.stringify(packagePayload, null, 2)}\n`;
  writeFileSync(output, jsonStr, 'utf8');
  const outputStat = statSync(output);

  console.log(`\n  ${c.bGreen}╔═════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.bGreen}║${c.reset}  ${c.bGreen}✔ 模组打包成功！${c.reset}                                            ${c.bGreen}║${c.reset}`);
  console.log(`  ${c.bGreen}╚═════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.bold}模组名称 :${c.reset} ${c.bCyan}${manifest.name || manifest.id}${c.reset} ${c.dim}(${manifest.id || ''})${c.reset}`);
  console.log(`  ${c.bold}模组版本 :${c.reset} ${c.white}v${manifest.version || '1.0.0'}${c.reset}`);
  console.log(`  ${c.bold}打包文件 :${c.reset} ${c.yellow}${files.length}${c.reset} 个文件`);
  console.log(`  ${c.bold}包大小   :${c.reset} ${c.cyan}${formatBytes(outputStat.size)}${c.reset}`);
  console.log(`  ${c.bold}输出路径 :${c.reset} ${c.white}${output}${c.reset}`);
  console.log(`\n  ${c.gray}▶ 安装测试: 在 ECHO 的 Mods 页面导入 "${output}"${c.reset}\n`);
} catch (err) {
  console.log(`\n  ${c.bRed}✖ 打包发生异常:${c.reset} ${err.message || err}\n`);
  process.exit(1);
}
