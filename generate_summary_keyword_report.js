#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

function escapeRegexLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const DEFAULT_INPUT_DIR = path.join('dist', 'Pixiv_2026-03-05');
const DEFAULT_OUTPUT_BASENAME = 'tag_name_summary_keyword_report.txt';
const DEFAULT_DUPLICATE_OUTPUT_BASENAME = 'summary_keyword_duplicates.txt';
const DEFAULT_KEYWORDS = [
  '隔離記事',
  '荒らし記事',
  '荒らし',
  '自演記事',
  '自演',
  '自作自演記事',
  '自作自演',
  '自演投稿',
  '不要記事',
  '不要記事化',
  '不要記事と判断',
  '不要記事に該当',
  '白紙化',
  '白紙化処理',
  '白紙化済',
  '白紙化記事',
  '白紙化された記事',
  '削除記事',
  '削除タグ',
  '立て逃げ記事',
  '立て逃げ',
  '意味のない記事',
  '削除依頼',
  '削除要請中',
  '削除待ち',
  '削除済',
  '削除希望',
  '削除',
  '除去',
  '排除',
  '撤去',
  '転送済み',
  '転送記事化',
  '存在していません',
  '情報削除済',
  'ガイドライン違反',
  '利用規約',
  '規約に反する',
  'タグとして使えない',
  '機能していない',
  '使われていないタグ',
  '使用されていないタグ',
  '使用不可',
  '誤記',
  '誤作成',
  '誤字',
  '誤情報',
  '誤表記',
  '作成ミス',
  '題名ミス',
  'タイトルに誤り',
  '重複記事',
  '宣伝',
  '独自研究',
  '不適切',
  '虚偽',
  'プライバシー権',
  '私物化',
  '審議',
  '問題',
  '内容の削除',
  '消去',
  '処置',
  '該当作品がないため白紙化',
  '筆者は削除されました',
];
const DEFAULT_KEYWORD_PATTERN = `(${DEFAULT_KEYWORDS.map(escapeRegexLiteral).join('|')})`;

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = '1';
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unknown argument: ${token}`);
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      const key = token.slice(2, eqIndex);
      const value = token.slice(eqIndex + 1);
      args[key] = value;
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for argument --${key}`);
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

function printHelp() {
  const message = [
    'Usage:',
    '  node generate_summary_keyword_report.js [--inputDir PATH] [--outputFile PATH] [--duplicateOutputFile PATH] [--keywordPattern REGEX]',
    '',
    'Defaults:',
    `  inputDir: ${DEFAULT_INPUT_DIR}`,
    `  outputFile: <inputDir>/${DEFAULT_OUTPUT_BASENAME}`,
    `  duplicateOutputFile: <outputDir>/${DEFAULT_DUPLICATE_OUTPUT_BASENAME}`,
    `  keywordPattern: ${DEFAULT_KEYWORD_PATTERN}`
  ].join('\n');
  process.stdout.write(`${message}\n`);
}

function normalizeText(text) {
  if (!text) {
    return '';
  }
  return text.replace(/\s+/gu, ' ').trim();
}

function getTextFromNode(node) {
  const parts = [];
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || current === undefined) {
      continue;
    }

    if (typeof current === 'string') {
      parts.push(current);
      continue;
    }

    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        stack.push(current[i]);
      }
      continue;
    }

    if (
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, 'content')
    ) {
      stack.push(current.content);
    }
  }

  return parts.join('');
}

function extractSummary(details) {
  if (!Array.isArray(details)) {
    return '';
  }

  let text = '';
  for (const detail of details) {
    if (
      !detail ||
      detail.type !== 'structured-content' ||
      !Array.isArray(detail.content)
    ) {
      continue;
    }

    for (const node of detail.content) {
      if (node?.data?.pixiv === 'summary') {
        text += getTextFromNode(node);
      }
    }
  }

  return normalizeText(text);
}

function getTermBankFiles(inputDir) {
  const names = fs
    .readdirSync(inputDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && /^term_bank_\d+\.json$/u.test(dirent.name))
    .map((dirent) => dirent.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  return names.map((name) => path.join(inputDir, name));
}

function compareMatchedEntries(left, right) {
  const summaryCompare = left.summary.localeCompare(right.summary, 'ja');
  if (summaryCompare !== 0) {
    return summaryCompare;
  }

  return left.tag.localeCompare(right.tag, 'ja');
}

function formatMainOutput(matchedEntries) {
  if (matchedEntries.length === 0) {
    return '';
  }

  const lines = [];
  for (const entry of matchedEntries) {
    lines.push('===', entry.tag, entry.summary);
  }

  return `${lines.join('\n')}\n`;
}

function buildDuplicateSummaryStats(matchedEntries) {
  const summaryCounts = new Map();

  for (const entry of matchedEntries) {
    const previousCount = summaryCounts.get(entry.summary) || 0;
    summaryCounts.set(entry.summary, previousCount + 1);
  }

  const duplicates = [];
  for (const [summary, count] of summaryCounts.entries()) {
    if (count >= 2) {
      duplicates.push({ summary, count });
    }
  }

  duplicates.sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.summary.localeCompare(right.summary, 'ja');
  });

  return duplicates;
}

function formatDuplicateOutput(duplicates) {
  if (duplicates.length === 0) {
    return '';
  }

  const lines = [];
  for (const duplicate of duplicates) {
    lines.push('===', `count: ${duplicate.count}`, duplicate.summary);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputDir = args.inputDir || DEFAULT_INPUT_DIR;
  const outputFile =
    args.outputFile || path.join(inputDir, DEFAULT_OUTPUT_BASENAME);
  const duplicateOutputFile =
    args.duplicateOutputFile ||
    path.join(path.dirname(outputFile), DEFAULT_DUPLICATE_OUTPUT_BASENAME);
  const keywordPattern = args.keywordPattern || DEFAULT_KEYWORD_PATTERN;

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const keywordRegex = new RegExp(keywordPattern, 'u');
  const filePrefilterRegex = new RegExp(keywordPattern, 'u');
  const termBankFiles = getTermBankFiles(inputDir);

  const startedAt = Date.now();
  const matchedEntries = [];
  let filesRead = 0;
  let filesParsed = 0;
  let filesSkippedByPrefilter = 0;
  let parseErrors = 0;
  let entriesScanned = 0;
  let matchedEntryCount = 0;

  for (const filePath of termBankFiles) {
    filesRead += 1;
    const raw = fs.readFileSync(filePath, 'utf8');

    if (!filePrefilterRegex.test(raw)) {
      filesSkippedByPrefilter += 1;
      continue;
    }

    let entries;
    try {
      entries = JSON.parse(raw);
      filesParsed += 1;
    } catch (error) {
      parseErrors += 1;
      process.stderr.write(
        `Skipped invalid JSON: ${path.basename(filePath)} (${error.message})\n`
      );
      continue;
    }

    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      entriesScanned += 1;
      if (!Array.isArray(entry) || entry.length < 6) {
        continue;
      }

      const tag = typeof entry[0] === 'string' ? entry[0].trim() : '';
      if (!tag) {
        continue;
      }

      const summary = extractSummary(entry[5]);
      if (!summary || !keywordRegex.test(summary)) {
        continue;
      }

      matchedEntries.push({ tag, summary });
      matchedEntryCount += 1;
    }
  }

  matchedEntries.sort(compareMatchedEntries);
  const duplicates = buildDuplicateSummaryStats(matchedEntries);

  fs.writeFileSync(outputFile, formatMainOutput(matchedEntries), 'utf8');
  fs.writeFileSync(
    duplicateOutputFile,
    formatDuplicateOutput(duplicates),
    'utf8'
  );

  const elapsedMs = Date.now() - startedAt;
  process.stdout.write(`Generated: ${outputFile}\n`);
  process.stdout.write(`Generated duplicates: ${duplicateOutputFile}\n`);
  process.stdout.write(`Files found: ${termBankFiles.length}\n`);
  process.stdout.write(`Files read: ${filesRead}\n`);
  process.stdout.write(`Files parsed: ${filesParsed}\n`);
  process.stdout.write(`Files skipped by prefilter: ${filesSkippedByPrefilter}\n`);
  process.stdout.write(`JSON parse errors: ${parseErrors}\n`);
  process.stdout.write(`Entries scanned: ${entriesScanned}\n`);
  process.stdout.write(`Written entries: ${matchedEntryCount}\n`);
  process.stdout.write(`Duplicate summaries (2+): ${duplicates.length}\n`);
  process.stdout.write(`Elapsed: ${elapsedMs} ms\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  normalizeText,
  getTextFromNode,
  extractSummary,
  compareMatchedEntries,
  buildDuplicateSummaryStats,
  formatMainOutput,
  formatDuplicateOutput,
  main,
};
