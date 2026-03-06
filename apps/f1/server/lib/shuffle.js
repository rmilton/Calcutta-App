const { randomInt } = require('node:crypto');

function shuffleArray(values) {
  const array = [...values];
  for (let idx = array.length - 1; idx > 0; idx -= 1) {
    const swapIdx = randomInt(idx + 1);
    [array[idx], array[swapIdx]] = [array[swapIdx], array[idx]];
  }
  return array;
}

module.exports = {
  shuffleArray,
};
