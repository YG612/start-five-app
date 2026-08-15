import {NativeModules} from 'react-native';
import type {BackupFileBridge} from '../screens/LocalBackupScreen';

type NativePickedBackup = Readonly<{
  name: string;
  bytesBase64: string;
}>;

type StartFiveBackupFilesNativeModule = Readonly<{
  saveBackup(
    suggestedName: string,
    bytesBase64: string,
  ): Promise<'saved' | 'cancelled'>;
  pickBackup(): Promise<NativePickedBackup | null>;
}>;

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const bits = (first << 16) | (second << 8) | third;
    result += alphabet[(bits >> 18) & 63] ?? '';
    result += alphabet[(bits >> 12) & 63] ?? '';
    result += index + 1 < bytes.length ? alphabet[(bits >> 6) & 63] : '=';
    result += index + 2 < bytes.length ? alphabet[bits & 63] : '=';
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
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const block = value.slice(index, index + 4);
    const first = alphabet.indexOf(block[0] ?? '');
    const second = alphabet.indexOf(block[1] ?? '');
    const third = block[2] === '=' ? 0 : alphabet.indexOf(block[2] ?? '');
    const fourth = block[3] === '=' ? 0 : alphabet.indexOf(block[3] ?? '');
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new Error('BACKUP_FILE_BASE64_INVALID');
    }
    const bits = (first << 18) | (second << 12) | (third << 6) | fourth;
    bytes.push((bits >> 16) & 255);
    if (block[2] !== '=') bytes.push((bits >> 8) & 255);
    if (block[3] !== '=') bytes.push(bits & 255);
  }
  return Uint8Array.from(bytes);
}

function requireNativeModule(): StartFiveBackupFilesNativeModule {
  const module = NativeModules.StartFiveBackupFiles as
    | StartFiveBackupFilesNativeModule
    | undefined;
  if (module === undefined) {
    throw new Error('START_FIVE_BACKUP_FILES_UNAVAILABLE');
  }
  return module;
}

export function createNativeBackupFileBridge(): BackupFileBridge {
  return {
    save(input) {
      return requireNativeModule().saveBackup(
        input.suggestedName,
        base64Encode(utf8Encode(input.bytes)),
      );
    },
    async pick() {
      const picked = await requireNativeModule().pickBackup();
      return picked === null
        ? null
        : {
            name: picked.name,
            bytes: utf8Decode(base64Decode(picked.bytesBase64)),
          };
    },
  };
}
