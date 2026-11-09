export function generateSku(productName: string, variantSuffix?: string): string {
  const cleanName = productName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  const cleanVariant = variantSuffix
    ? '-' +
      variantSuffix
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4)
    : '';

  const randomSalt = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${cleanName}${cleanVariant}-${randomSalt}`;
}

export function generateEan13Barcode(prefix = '20'): string {
  // Prefix '20' is typically reserved for internal in-store retail items
  let code = prefix;
  while (code.length < 12) {
    code += Math.floor(Math.random() * 10).toString();
  }

  // Calculate EAN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return `${code}${checkDigit}`;
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}
