const orcids = [
  '0000-0003-0396-0333',
  '0000-0002-2605-6569',
  '0000-0001-6102-7846',
  '0000-0002-0209-2784',
  '0000-0002-1053-2030'
];
const pre2020Works = [51, 38, 134, 81, 16];
const avg = pre2020Works.reduce((a, b) => a + b, 0) / pre2020Works.length;
console.log(avg);
