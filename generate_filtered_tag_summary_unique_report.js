#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const {
  extractSummary,
  getTextFromNode,
  compareMatchedEntries,
  formatMainOutput,
} = require('./generate_summary_keyword_report.js');

const DEFAULT_INPUT_DIR = path.join('dist', 'PixivFiltered_2026-03-05');
const DEFAULT_UNIQUE_OUTPUT_BASENAME = 'tag_name_summary_unique.txt';
const DEFAULT_ALL_OUTPUT_BASENAME = 'tag_name_summary_all.txt';
const FILTERED_PARENT_CATEGORIES = new Set([
  '隔離記事',
  '荒らし記事',
  '自演記事',
  '不要記事',
  '白紙化',
  '削除記事',
  '立て逃げ記事',
  '意味のない記事',
]);
const FILTERED_PARENT_CATEGORY_VALUES = [...FILTERED_PARENT_CATEGORIES];

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
    '  node generate_filtered_tag_summary_unique_report.js [--inputDir PATH] [--outputFile PATH] [--allOutputFile PATH]',
    '',
    'Defaults:',
    `  inputDir: ${DEFAULT_INPUT_DIR}`,
    `  outputFile: <inputDir>/${DEFAULT_UNIQUE_OUTPUT_BASENAME} (unique by summary)`,
    `  allOutputFile: <inputDir>/${DEFAULT_ALL_OUTPUT_BASENAME}`,
  ].join('\n');

  process.stdout.write(`${message}\n`);
}

function getTermBankFiles(inputDir) {
  const names = fs
    .readdirSync(inputDir, { withFileTypes: true })
    .filter(
      (dirent) => dirent.isFile() && /^term_bank_\d+\.json$/u.test(dirent.name)
    )
    .map((dirent) => dirent.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  return names.map((name) => path.join(inputDir, name));
}

function collectParentCategoryLabels(node, labels) {
  if (node === null || node === undefined) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectParentCategoryLabels(item, labels);
    }
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  if (node.tag === 'a') {
    const rawLabel =
      typeof node.content === 'string' ? node.content : getTextFromNode(node.content);
    const normalizedLabel = rawLabel.replace(/^←/u, '').trim();
    if (normalizedLabel) {
      labels.push(normalizedLabel);
    }
  }

  if (Object.prototype.hasOwnProperty.call(node, 'content')) {
    collectParentCategoryLabels(node.content, labels);
  }
}

function extractParentCategories(details) {
  if (!Array.isArray(details)) {
    return [];
  }

  const labels = [];
  for (const detail of details) {
    if (
      !detail ||
      detail.type !== 'structured-content' ||
      !Array.isArray(detail.content)
    ) {
      continue;
    }

    for (const node of detail.content) {
      if (node?.data?.pixiv !== 'parent-link') {
        continue;
      }

      collectParentCategoryLabels(node.content, labels);
    }
  }

  return labels;
}

function hasFilteredParentCategory(details) {
  const parentCategories = extractParentCategories(details);
  return parentCategories.some((parentCategory) =>
    FILTERED_PARENT_CATEGORY_VALUES.some((filteredCategory) =>
      parentCategory.includes(filteredCategory)
    )
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputDir = args.inputDir || DEFAULT_INPUT_DIR;
  const outputFile =
    args.outputFile || path.join(inputDir, DEFAULT_UNIQUE_OUTPUT_BASENAME);
  const allOutputFile =
    args.allOutputFile || path.join(inputDir, DEFAULT_ALL_OUTPUT_BASENAME);

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const termBankFiles = getTermBankFiles(inputDir);
  const allEntries = [];
  const startedAt = Date.now();

  let filesRead = 0;
  let filesParsed = 0;
  let parseErrors = 0;
  let entriesScanned = 0;
  let summaryDuplicatesSkipped = 0;
  let entriesSkippedByFilteredParentCategory = 0;

  for (const filePath of termBankFiles) {
    filesRead += 1;
    const raw = fs.readFileSync(filePath, 'utf8');

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

      const details = entry[5];
      if (hasFilteredParentCategory(details)) {
        entriesSkippedByFilteredParentCategory += 1;
        continue;
      }

      const summary = extractSummary(details);
      if (!summary) {
        continue;
      }

      allEntries.push({ tag, summary });
    }
  }

  allEntries.sort(compareMatchedEntries);
  const uniqueBySummaryEntries = [];
  const seenSummaries = new Set();

  for (const entry of allEntries) {
    if (seenSummaries.has(entry.summary)) {
      summaryDuplicatesSkipped += 1;
      continue;
    }
    seenSummaries.add(entry.summary);
    uniqueBySummaryEntries.push(entry);
  }

  fs.writeFileSync(allOutputFile, formatMainOutput(allEntries), 'utf8');
  fs.writeFileSync(outputFile, formatMainOutput(uniqueBySummaryEntries), 'utf8');

  const elapsedMs = Date.now() - startedAt;
  process.stdout.write(`Generated: ${outputFile}\n`);
  process.stdout.write(`Generated all pairs: ${allOutputFile}\n`);
  process.stdout.write(`Files found: ${termBankFiles.length}\n`);
  process.stdout.write(`Files read: ${filesRead}\n`);
  process.stdout.write(`Files parsed: ${filesParsed}\n`);
  process.stdout.write(`JSON parse errors: ${parseErrors}\n`);
  process.stdout.write(`Entries scanned: ${entriesScanned}\n`);
  process.stdout.write(
    `Entries skipped by filtered parent category: ${entriesSkippedByFilteredParentCategory}\n`
  );
  process.stdout.write(`All tag+summary entries: ${allEntries.length}\n`);
  process.stdout.write(
    `Unique summaries (tag+summary output): ${uniqueBySummaryEntries.length}\n`
  );
  process.stdout.write(`Repeated summaries skipped: ${summaryDuplicatesSkipped}\n`);
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
  parseArgs,
  getTermBankFiles,
  main,
};
