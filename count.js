import fs from 'fs';
import knex from 'knex';
import getUuid from "uuid-by-string";

import books from './output/seed-data/Books.json';

const BOOKS_DIR = 'output/seed-data';
const BOOK_COUNTS_OUTPUT = 'output/book_counts.sql';
const HASH_VERSION = 3;

const knexClient = knex({
  client: 'pg',
});


(async () => {
  fs.writeFileSync(BOOK_COUNTS_OUTPUT, `-- Book Counts \n \n`);

  books.forEach(book => {
    const contents = fs.readFileSync(`${BOOKS_DIR}/${book.replace(/ /gm, "")}.json`);
    const data = JSON.parse(contents);

    const id = getUuid(data.book, HASH_VERSION);
    const count = Object.values(data.chapters).length;

    fs.appendFileSync(
      BOOK_COUNTS_OUTPUT,
      `${eval(knexClient('books').where('id', '=', id).update({ count })).toQuery()}; \n`,
    );
  });
})();