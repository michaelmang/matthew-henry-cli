import fs from 'fs';

const COMMENTARIES_DIR = 'output/commentaries';
const COMMENTARIES_OUTPUT = 'output/commentaries.sql';

(async () => {
  fs.writeFileSync(COMMENTARIES_OUTPUT, `-- Commentaries \n \n`);

  fs.readdirSync(COMMENTARIES_DIR).forEach(file => {
    const data = fs.readFileSync(`${COMMENTARIES_DIR}/${file}`);
    fs.appendFileSync(COMMENTARIES_OUTPUT, data);
  });
})();