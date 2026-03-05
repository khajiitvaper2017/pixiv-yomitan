import { Dictionary } from 'yomichan-dict-builder';
import { SingleBar } from 'cli-progress';
import { addArticleToDictionary } from './yomitan/addArticleToDictionary';
import { isDevMode } from './helpers/isDevMode';
import { isValidArticle } from './helpers/isValidArticle';
import { addAllAssetsToDictionary } from './yomitan/addAllAssetsToDictionary';
import yargs from 'yargs';
import { PrismaClient } from '@prisma/client';
import { articleGenerator } from './helpers/articleGenerator';
import { DEV_MODE_ARTICLE_COUNT, CHUNK_COUNT } from './yomitan/constants';
import { TERM_BANK_MAX_SIZE } from './yomitan/constants';
export const prisma = new PrismaClient();

(async () => {
  const argv = await yargs(process.argv.slice(2))
    .options({
      light: {
        type: 'boolean',
        description: 'Output lightweight dictionary',
        default: false,
      },
      onlyFiltered: {
        type: 'boolean',
        description: 'Output only entries rejected by isValidArticle (reverse set)',
        default: false,
      },
      tagName: {
        type: 'string',
        description: 'Tag name of the Github release',
        default: 'latest',
      },
    })
    .parse();
  const pixivLight = !!argv.light;
  const onlyFiltered = !!argv.onlyFiltered;
  const tagName = argv.tagName;
  const dictionaryTitle = `Pixiv${pixivLight ? ' Light' : ''}${onlyFiltered ? ' Filtered' : ''}`;
  const indexVariant = onlyFiltered
    ? pixivLight
      ? 'light_filtered'
      : 'filtered'
    : pixivLight
      ? 'light'
      : 'full';

  console.log(
    `Building dictionary with ${pixivLight ? 'light' : 'full'} mode${onlyFiltered ? ' (only filtered entries)' : ''}. Tag name: ${tagName}.`,
  );

  const devMode = isDevMode();
  // If dev mode, limit article count
  if (devMode) {
    console.log(
      `Running in dev mode, limiting article count to ${DEV_MODE_ARTICLE_COUNT}.`,
    );
  }

  const allArticlesCount = await prisma.pixivArticle.count();
  console.log(`Found ${allArticlesCount} articles`);

  // YYYY-MM-DD
  const latestDateShort = new Date().toISOString().split('T')[0];

  const PIXIV_ZIP_FILENAME: `${string}.zip` = `${dictionaryTitle.replace(/\s+/g, '')}_${latestDateShort}.zip`;
  const INDEX_FILENAME = `pixiv_${indexVariant}_index.json`;
  const EXPORT_FOLDER = 'dist';
  const totalArticlesToProcess = devMode
    ? Math.min(allArticlesCount, DEV_MODE_ARTICLE_COUNT)
    : allArticlesCount;

  const dictionary = new Dictionary({
    fileName: PIXIV_ZIP_FILENAME,
    termBankMaxSize: TERM_BANK_MAX_SIZE,
  });

  await addAllAssetsToDictionary(dictionary);

  dictionary.setIndex(
    {
      author: `Pixiv contributors, Marv`,
      attribution: `https://dic.pixiv.net`,
      url: `https://github.com/MarvNC/pixiv-yomitan`,
      title: `${dictionaryTitle} [${latestDateShort}]`,
      revision: latestDateShort,
      description: `Article summaries from the Pixiv encyclopedia (ピクシブ百科事典). Source set: ${allArticlesCount} articles.${pixivLight ? ' Light mode.' : ''}${onlyFiltered ? ' Filtered-only mode (reverse validation set).' : ''}
    Pixiv dumps used to build this found at https://github.com/MarvNC/pixiv-dump.
    Built with https://github.com/MarvNC/yomichan-dict-builder.`,
      isUpdatable: true,
      indexUrl: `https://github.com/MarvNC/pixiv-yomitan/releases/latest/download/${INDEX_FILENAME}`,
      downloadUrl: `https://github.com/MarvNC/pixiv-yomitan/releases/download/${tagName}/${PIXIV_ZIP_FILENAME}`,
    },
    EXPORT_FOLDER,
    INDEX_FILENAME,
  );

  const progressBar = new SingleBar({
    format:
      'Progress |{bar}| {percentage}% | ETA: {eta_formatted} | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  console.log(`Building dictionary...`);
  progressBar.start(totalArticlesToProcess, 0);

  let invalidCount = 0;
  let includedCount = 0;
  let processedCount = 0;

  // Get article generator with limit
  const articleGen = articleGenerator({
    chunkCount: CHUNK_COUNT,
    articleLimit: devMode ? DEV_MODE_ARTICLE_COUNT : Infinity,
  });
  for await (const article of articleGen) {
    const validArticle = isValidArticle(article);
    if (!validArticle) {
      invalidCount++;
    }

    const shouldInclude = onlyFiltered ? !validArticle : validArticle;
    processedCount++;
    if (!shouldInclude) {
      progressBar.increment();
      continue;
    }

    await addArticleToDictionary(article, pixivLight, dictionary);
    includedCount++;
    progressBar.increment();
  }
  progressBar.stop();

  if (onlyFiltered) {
    console.log(`Included ${includedCount} filtered articles.`);
    console.log(`Skipped ${processedCount - includedCount} non-filtered articles.`);
  } else {
    console.log(`Skipped ${invalidCount} invalid articles.`);
  }

  console.log(`Exporting dictionary...`);
  const stats = await dictionary.export('dist');
  console.log(`Exported ${stats.termCount} terms.`);
  const additionalTerms = stats.termCount - includedCount;
  if (additionalTerms > 0) {
    console.log(`(${additionalTerms} additional terms from brackets)`);
  }
  await prisma.$disconnect();
})();
