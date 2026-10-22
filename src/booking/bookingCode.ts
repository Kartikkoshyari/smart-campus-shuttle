/**
 * Booking IDs look like SCS-7K4P2Q. Letters and digits that are easy to
 * confuse (0/O, 1/I/L) are left out, so IDs are easy to read aloud.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export const BOOKING_CODE_PATTERN = /^SCS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

/** Random bytes from the browser's secure random generator. */
function secureRandomBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count))
}

export function generateBookingCode(randomBytes: (count: number) => Uint8Array = secureRandomBytes): string {
  // Bytes of 248 and above are skipped so every character is equally likely.
  const limit = 256 - (256 % ALPHABET.length)
  let code = ''
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte < limit && code.length < CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length]
    }
  }
  return `SCS-${code}`
}
