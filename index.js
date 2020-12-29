import arg from "arg";
import chalk from "chalk";
import clear from "clear";
import cliProgress from 'cli-progress';
import CLI from "clui";
import figlet from "figlet";
import fs from "fs";
import knex from 'knex';
import tolower from "lodash.tolower";
import puppeteer from "puppeteer";
import getUuid from "uuid-by-string";

let warn = console.warn;
console.warn = (msg, ...args) => {
  if (!msg.includes("waitFor is deprecated")) {
    warn.call(console, msg, ...args);
  }
};

const knexClient = knex({
  client: 'pg',
});

const BOOKS_OUTPUT = "output/books.sql";
const COMMENTARIES_OUTPUT = "output/commentaries";
const DELAY = 300;
const HASH_VERSION = 3;
const SERMONS = "https://www.christianity.com/bible/commentary.php?com=mhc";

const blacklist = [
  "javascript:void(0);",
  "https://www.christianity.com/bible/help.php?topic=About",
];

function getUuidByString(str) {
  return getUuid(str, HASH_VERSION);
}

function newStatus(str, color = "blueBright") {
  return new CLI.Spinner(chalk[color](str));
}

async function init() {
  clear();
  console.log(
    chalk.yellow(figlet.textSync("Matthew Henry", { horizontalLayout: "full" }))
  );

  const status = newStatus("🚀 Launching browser...");
  status.start();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  status.stop();

  return [browser, page];
}

async function getBooks(page) {
  return await page.$$eval(".col-md-6 .row a[href]", (as) =>
    as.map((a) => a.innerText)
  );
}

async function getLinks(page) {
  return await page.$$eval(
    "a",
    (as, blacklist) => {
      return as.map((a) => a.href).filter((href) => !blacklist.includes(href));
    },
    blacklist
  );
}

async function getBookInfo(page) {
  const contentElement = await page.$("#read-this-chapter");

  return await page.evaluate((elem) => {
    const textAroundBookInfo = /(Read all of )/gm;
    const charactersAroundBookInfo = /(\(?\)?)/gm;
    const bookInfo = elem.innerText
      .replace(textAroundBookInfo, "")
      .replace(charactersAroundBookInfo, "");

    const numbersAtEnd = /[ 0-9]+$/gm;

    return {
      book: bookInfo.replace(numbersAtEnd, ""),
      chapter: bookInfo.match(numbersAtEnd).join("").trimLeft(),
    };
  }, contentElement);
}

async function getDescription(page) {
  const contentElement = await page.$(".text");

  return await page.evaluate((elem) => {
    return elem.querySelector("p").innerText;
  }, contentElement);
}

async function getContent(page) {
  const contentElement = await page.$(".text");

  return await page.evaluate((elem) => {
    const completeOrConciseLine = /\s+<span class="four".*/gm;
    const startOfLink = /<a href="(.*?)"|onclick="(.*?)">/gm;
    const endOfLink = /<\/a>/gm;
    const allLineBreaks = /\r?\n|\r/gm;

    return elem.outerHTML
      .replace(completeOrConciseLine, "")
      .replace(startOfLink, "")
      .replace(endOfLink, "")
      .replace(allLineBreaks, "");
  }, contentElement);
}

async function getImages() {
  const response = await unsplash.photos.getRandom({
    count: 2,
    query: "nature",
  });

  return response.response.map(({ urls }) => urls.regular);
}

(async () => {
  const args = arg({
    // Types
    "--books": [String], // --tag <string> or --tag=<string>

    // Aliases
    "-b": "--books",
  });

  const [browser, page] = await init();

  const status1 = newStatus("Fetching books...");
  status1.start();
  await page.goto(SERMONS);
  await page.waitFor(DELAY);

  const books = await getBooks(page);

  const bookObjs = books.map((book, index) => ({
    id: getUuidByString(book),
    name: book,
    index,
  }));

  fs.writeFileSync(
    BOOKS_OUTPUT,
    `-- Books \n \n`
  );

  for (const bookObj of bookObjs) {
    fs.appendFileSync(
      BOOKS_OUTPUT,
      `${eval(knexClient('books').insert(bookObj)).toQuery()}; \n`,
    );

    fs.writeFileSync(
      COMMENTARIES_OUTPUT + `/${bookObj.name}.sql`,
      `-- Commentaries \n \n`,
    );
  }

  const bookFilter = (href) => {
    return href.includes("b=");
  };
  let bookLinks = await getLinks(page);
  bookLinks = bookLinks.filter(bookFilter)
  
  if (args._.length){
    bookLinks.filter((_link, idx) => {
      const matchingBook = books.find((_book, index) => {
        return idx === index;
      });

      return args._.map((x) => tolower(x)).includes(tolower(matchingBook));
    });
  }

  status1.stop();

  for (const bookLink of bookLinks) {
    const status2 = newStatus("Fetching chapter...");
    status2.start();
    await page.goto(bookLink);

    await page.waitFor(DELAY);

    const chapterFilter = (href) => {
      return href.includes("c=") && !href.includes("c=0");
    };
    let commentaryLinks = await getLinks(page);
    commentaryLinks = commentaryLinks.filter(chapterFilter);
    status2.stop();

    const status3 = newStatus(`Gathering commentaries...`);
    status3.start();
    status3.stop();

    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |' + chalk.cyanBright('{bar}') + '| {percentage}% || {value}/{total} Chunks || Speed: {speed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(commentaryLinks.length, 0, {
      speed: "N/A"
    });
    
    for (const commentaryLink of commentaryLinks) {
      await page.goto(commentaryLink);
      await page.waitFor(DELAY);
      const { book: bookName, chapter } = await getBookInfo(page);
      const content = await getContent(page);
      const description = await getDescription(page);

      const commentary = {
        content,
        description,
        book_chapter: parseInt(chapter),
        book_id: getUuidByString(bookName),
      };

      fs.appendFileSync(
        COMMENTARIES_OUTPUT + `/${bookName}.sql`,
        `${eval(knexClient('commentaries').insert(commentary)).toQuery()}; \n`,
      );
      
      progressBar.increment();
    }

    progressBar.stop();
  }

  console.log(chalk.greenBright("🌟 All commentary queries generated."));

  await browser.close();
})();
