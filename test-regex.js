const cases = [
  '{"hardwareName": "Friction Stay 14"(Set)", "group":"HARDWARE"}',
  '{"name": "12\\" Screen", "qty": 1}',
  '{"desc": "Size \\"M\\""}',
  '{"formula": "IF(Width=\\"\\", \\"\\", Width)"}'
];

for (const raw of cases) {
  let fixed = raw.replace(/(?<![:,\[{]\s*)"(?!\s*[:,\]}])/g, '\\"');
  // Avoid double escaping if the quote was already escaped
  fixed = fixed.replace(/\\\\"/g, '\\"');
  console.log('Fixed:', fixed);
  try { console.log(JSON.parse(fixed)); } catch(e) { console.error('Error:', e.message); }
}
