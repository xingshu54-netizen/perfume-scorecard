/**
 * CLI 参数解析与校验（供 e2e-mobile.mjs 与 self-test.mjs 共享）
 */

export function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    tier: 'all',
    viewport: 'both',
    mode: 'http',
    browser: undefined,
    selfTest: false,
    list: false,
    screenshots: true,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--self-test') {
      opts.selfTest = true;
    } else if (arg === '--list') {
      opts.list = true;
    } else if (arg === '--no-screenshots') {
      opts.screenshots = false;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length);
    } else if (arg === '--tier') {
      if (i + 1 >= argv.length) throw new Error('缺少 --tier 参数值（可选: 1|2|3|4|all）');
      opts.tier = argv[++i];
    } else if (arg.startsWith('--viewport=')) {
      opts.viewport = arg.slice('--viewport='.length);
    } else if (arg === '--viewport') {
      if (i + 1 >= argv.length) throw new Error('缺少 --viewport 参数值（可选: 375x812|390x844|both）');
      opts.viewport = argv[++i];
    } else if (arg.startsWith('--mode=')) {
      opts.mode = arg.slice('--mode='.length);
    } else if (arg === '--mode') {
      if (i + 1 >= argv.length) throw new Error('缺少 --mode 参数值（可选: http|file|both）');
      opts.mode = argv[++i];
    } else if (arg.startsWith('--browser=')) {
      opts.browser = arg.slice('--browser='.length);
    } else if (arg === '--browser') {
      if (i + 1 >= argv.length) throw new Error('缺少 --browser 参数值（可选: chrome|edge）');
      opts.browser = argv[++i];
    } else {
      throw new Error(`不支持的命令行参数: ${arg}`);
    }
  }

  if (!['1', '2', '3', '4', 'all'].includes(opts.tier)) {
    throw new Error(`无效 --tier 值: ${opts.tier}（可选: 1|2|3|4|all）`);
  }
  if (!['375x812', '390x844', '375', '390', 'both'].includes(opts.viewport)) {
    throw new Error(`无效 --viewport 值: ${opts.viewport}（可选: 375x812|390x844|both）`);
  }
  if (!['http', 'file', 'both'].includes(opts.mode)) {
    throw new Error(`无效 --mode 值: ${opts.mode}（可选: http|file|both）`);
  }
  if (opts.browser !== undefined && !['chrome', 'edge'].includes(opts.browser)) {
    throw new Error(`无效 --browser 值: ${opts.browser}（可选: chrome|edge）`);
  }

  return opts;
}
