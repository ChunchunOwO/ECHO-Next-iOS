import {
  normalizePowerampRemoteHost,
  normalizePowerampRemoteToken,
  type PowerampRemoteConnection,
} from './client';

export const parsePowerampPairingUri = (input: string): PowerampRemoteConnection => {
  const raw = input.trim();
  if (!raw) throw new Error('Please scan a Poweramp Remote pairing code.');

  const url = new URL(raw);
  if (url.protocol !== 'echo-poweramp:' || url.hostname !== 'pair') {
    throw new Error('This is not a Poweramp Remote pairing code.');
  }

  const host = normalizePowerampRemoteHost(url.searchParams.get('host') ?? '');
  const token = normalizePowerampRemoteToken(url.searchParams.get('token') ?? '');
  const port = Number(url.searchParams.get('port') ?? 27806);
  if (!host || !token) throw new Error('The pairing code is missing its address or token.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The pairing code contains an invalid port.');
  }

  return {
    host,
    name: url.searchParams.get('name')?.trim() || 'Poweramp',
    port,
    scheme: 'http',
    token,
  };
};
