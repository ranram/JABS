// Saved text limits use String.length, where an emoji can count as two units.
// Counting Unicode code points would change which saved values are accepted.
export const utf16AtMost = (maximum: number) => (value: string) => value.length <= maximum;
