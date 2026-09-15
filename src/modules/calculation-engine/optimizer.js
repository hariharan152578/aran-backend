/**
 * First-Fit Decreasing (FFD) Heuristic for 1D Bin Packing.
 * Pack cut lengths into stock bars of fixed capacity (e.g. 5850mm).
 * 
 * @param {Array<number>} cutLengths - Array of requested cut lengths (e.g., [1200, 900, 850, ...])
 * @param {number} barLength - Standard stock bar length (default: 5850)
 * @returns {object} - Optimal packing schema, bars count, and waste metrics
 */
export const optimize1D = (cutLengths, barLength = 5850) => {
  if (!cutLengths || cutLengths.length === 0) {
    return { bars: [], totalBars: 0, totalWaste: 0, wastePercent: 0 };
  }

  // Filter out invalid lengths
  const validCuts = cutLengths
    .map(Number)
    .filter(len => len > 0 && len <= barLength);

  // Sort lengths descending
  const sortedCuts = [...validCuts].sort((a, b) => b - a);

  // Array of bars, each containing: { id, remainingSpace, cuts: [] }
  const bars = [];

  sortedCuts.forEach((cut, idx) => {
    let placed = false;

    // Find the first bar that can fit the current cut
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].remainingSpace >= cut) {
        bars[i].cuts.push(cut);
        bars[i].remainingSpace -= cut;
        placed = true;
        break;
      }
    }

    // If no existing bar can fit it, open a new stock bar
    if (!placed) {
      bars.push({
        id: bars.length + 1,
        totalLength: barLength,
        remainingSpace: barLength - cut,
        cuts: [cut]
      });
    }
  });

  const totalBars = bars.length;
  const totalLengthUsed = totalBars * barLength;
  const totalCutsLength = validCuts.reduce((sum, val) => sum + val, 0);
  const totalWaste = totalLengthUsed - totalCutsLength;
  const wastePercent = totalLengthUsed > 0 ? Number(((totalWaste / totalLengthUsed) * 100).toFixed(2)) : 0;

  return {
    bars,
    totalBars,
    totalCutsLength,
    totalWaste,
    wastePercent
  };
};
