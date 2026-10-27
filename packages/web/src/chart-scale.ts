/** Approximate visual percentages only; never use these for money or ranking.
 * Normalize decimal strings before converting a bounded significand to Number,
 * so quantities outside floating-point range still have usable geometry.
 */
export function chartPercentages(values: string[], minimum = 0): number[] {
  const magnitudes = values.map((value) => {
    const unsigned = value.replace(/^[+-]/, '');
    const point = unsigned.indexOf('.');
    const wholeLength = point < 0 ? unsigned.length : point;
    const digits = unsigned.replace('.', '');
    const first = digits.search(/[1-9]/);
    if (first < 0) return { exponent: 0, significand: 0 };
    const significant = digits.slice(first, first + 16);
    return {
      exponent: wholeLength - first - 1,
      significand: Number(`${significant[0]}.${significant.slice(1)}`),
    };
  });
  let max = { exponent: 0, significand: 0 };
  for (const magnitude of magnitudes) {
    if (
      magnitude.significand &&
      (!max.significand ||
        magnitude.exponent > max.exponent ||
        (magnitude.exponent === max.exponent &&
          magnitude.significand > max.significand))
    )
      max = magnitude;
  }
  return magnitudes.map(({ exponent, significand }) =>
    significand === 0
      ? 0
      : Math.min(
          100,
          Math.max(
            minimum,
            (significand / max.significand) *
              10 ** (exponent - max.exponent) *
              100,
          ),
        ),
  );
}
