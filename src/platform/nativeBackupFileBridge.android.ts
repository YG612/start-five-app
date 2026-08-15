import {NativeModules} from 'react-native';
import type {BackupFileBridge} from '../screens/LocalBackupScreen';

type PickedBackup = Readonly<{
  name: string;
  bytesBase64: string;
}>;

type StartFiveBackupFilesNativeModule = Readonly<{
  saveBackup(
    suggestedName: string,
    bytesBase64: string,
  ): Promise<'saved' | 'cancelled'>;
  pickBackup(): Promise<PickedBackup | null>;
}>;

const nativeModule = NativeModules.StartFiveBackupFiles as
  | StartFiveBackupFilesNativeModule
  | undefined;

function requireNativeModule(): StartFiveBackupFilesNativeModule {
  if (nativeModule === undefined) {
    throw new Error('START_FIVE_BACKUP_FILES_UNAVAILABLE');
  }
  return nativeModule;
}

function utf8Encode(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else if (character !== undefined) {
      bytes.push(character.charCodeAt(0));
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}

function base64Encode(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const bits = (a << 16) | (b << 8) | c;
    result += alphabet[(bits >> 18) & 63] ?? '';
    result += alphabet[(bits >> 12) & 63] ?? '';
    result += index + 1 < bytes.length
      ? alphabet[(bits >> 6) & 63] ?? ''
      : '=';
    result += index + 2 < bytes.length
      ? alphabet[bits & 63] ?? ''
      : '=';
  }
  return result;
}

function base64Decode(value: string): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error('BACKUP_FILE_BASE64_INVALID');
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const block = value.slice(index, index + 4);
    const a = alphabet.indexOf(block[0] ?? '');
    const b = alphabet.indexOf(block[1] ?? '');
    const c = block[2] === '=' ? 0 : alphabet.indexOf(block[2] ?? '');
    const d = block[3] === '=' ? 0 : alphabet.indexOf(block[3] ?? '');
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((bits >> 16) & 255);
    if (block[2] !== '=') bytes.push((bits >> 8) & 255);
    if (block[3] !== '=') bytes.push(bits & 255);
  }
  return Uint8Array.from(bytes);
}

export function createNativeBackupFileBridge(): BackupFileBridge {
  const module = requireNativeModule();
  return {
    save: input => module.saveBackup(
      input.suggestedName,
      base64Encode(utf8Encode(input.bytes)),
    ),
    async pick() {
      const picked = await module.pickBackup();
      if (picked === null) return null;
      return {
        name: picked.name,
        bytes: utf8Decode(base64Decode(picked.bytesBase64)),
      };
    },
  };
}
