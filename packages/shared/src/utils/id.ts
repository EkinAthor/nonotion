const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateRandomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

export function generatePageId(): string {
  return `pg_${generateRandomString(12)}`;
}

export function generateBlockId(): string {
  return `blk_${generateRandomString(12)}`;
}

export function generateUserId(): string {
  return `usr_${generateRandomString(12)}`;
}

export function generatePropertyId(): string {
  return `prop_${generateRandomString(12)}`;
}

export function generateOptionId(): string {
  return `opt_${generateRandomString(12)}`;
}

export function isPageId(id: string): boolean {
  return id.startsWith('pg_') && id.length === 15;
}

export function isBlockId(id: string): boolean {
  return id.startsWith('blk_') && id.length === 16;
}

export function isUserId(id: string): boolean {
  return id.startsWith('usr_') && id.length === 16;
}

export function isPropertyId(id: string): boolean {
  return id.startsWith('prop_') && id.length === 17;
}

export function isOptionId(id: string): boolean {
  return id.startsWith('opt_') && id.length === 16;
}

export function generateFileId(): string {
  return `file_${generateRandomString(12)}`;
}

export function isFileId(id: string): boolean {
  return id.startsWith('file_') && id.length === 17;
}
