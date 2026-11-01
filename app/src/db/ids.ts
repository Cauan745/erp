type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

function randomBytes(length: number): Uint8Array {
  const values = new Uint8Array(length);
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoLike?.getRandomValues) {
    cryptoLike.getRandomValues(values);
    return values;
  }

  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 256);
  }
  return values;
}

export function createUuid(): string {
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();

  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
